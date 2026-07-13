import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useWidgetChat } from "#features/chat";
import {
  ConversationSidebar,
  ConversationSwitcher,
  emptyStateDescription,
  toEmptyStateSuggestions,
  WidgetConversation,
  WidgetEmptyState,
  WidgetHeaderTitle,
} from "#features/conversation";
import {
  ClosedWidgetLauncher,
  ResizablePanel,
  useWidgetPanelSize,
  WidgetHeader,
} from "#features/panel";
import { WidgetFooter } from "#features/prompt";
import { SettingsView, useSendPreference, useToolDetailPreference } from "#features/settings";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { contextTokensFromUsage } from "#entities/chat";
import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import { resolveWidgetLabels, WidgetLabelsProvider } from "#shared/lib/widget-labels";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";
import { useWidgetModelSelection } from "../model/selection/side-chat-model-selection.js";
import { useWidgetToolSelection } from "../model/selection/side-chat-tool-selection.js";
import { createSideChatWidgetQueryClient } from "../model/side-chat-query-client.js";
import type {
  ProtocolSideChatWidgetProps,
  SideChatWidgetProps,
} from "../model/side-chat-widget.types.js";
import { WorkflowSideChatWidget } from "./workflow/workflow-side-chat-widget.js";

export type {
  RenderActivityItem,
  SideChatWidgetTurnProfile,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  WorkflowSideChatWidgetProps,
  SideChatWidgetQuickAction,
  WidgetActivityItem,
} from "../model/side-chat-widget.types.js";

/**
 * Render one self-contained Side Chat shell around a host-supplied API client.
 *
 * This boundary owns the widget-local query cache and delegates turn lifecycle,
 * browser persistence, host integration, and visual composition to the model
 * hooks below. It does not create service configuration or provider/runtime state.
 */
export const SideChatWidget = (props: SideChatWidgetProps) => {
  const [queryClient] = useState(createSideChatWidgetQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {props.workflowChat ? (
        <WorkflowSideChatWidget {...props} />
      ) : (
        <SideChatWidgetContent {...props} />
      )}
    </QueryClientProvider>
  );
};

/**
 * Compose the widget's independent controllers into one render tree.
 *
 * Panel/settings state controls the shell, model and tool selection shape the
 * next request, and `useWidgetChat` owns transcript lifecycle. This component
 * wires those results to presentation components; transport decoding and server
 * policy remain behind the host-supplied client.
 */
const SideChatWidgetContent = ({
  turnProfiles = [],
  client,
  conversationStorageKey,
  defaultTurnProfileId,
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  hostBridge,
  labels: labelsProp,
  onOpenChange,
  open,
  panelActions,
  panelSizeStorageKey,
  quickActions = [],
  renderActivityItem,
  renderAgentMark,
  renderClosedLauncher = true,
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  themeStorageKey,
}: ProtocolSideChatWidgetProps) => {
  const labels = useMemo(() => resolveWidgetLabels(labelsProp), [labelsProp]);
  const initialProfileId = resolveInitialProfileId(defaultTurnProfileId, turnProfiles);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { panelSize, setPanelSize } = useWidgetPanelSize({
    defaultPanelSize,
    storageKey: panelSizeStorageKey,
  });
  const [selectedProfileId, setSelectedProfileId] = useState(initialProfileId);
  const isOpen = open ?? uncontrolledOpen;
  const requestOpenChange = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const theme = useWidgetTheme({ defaultTheme, storageKey: themeStorageKey });
  const appearance = useWidgetAppearance();
  const sendPreference = useSendPreference();
  const toolDetailPreference = useToolDetailPreference();
  const modelSelection = useWidgetModelSelection({
    turnProfiles,
    client,
    selectedProfileId,
    setSelectedProfileId,
  });
  const toolSelection = useWidgetToolSelection({ client });
  const chat = useWidgetChat({
    client,
    conversationStorageKey,
    hostBridge,
    selectedModel: modelSelection.selectedModel,
    selectedProfileId,
    enabledToolNames: toolSelection.enabledToolNames,
  });
  const isBusy = isBusyStatus(chat.status);
  const suggestions = useMemo(() => toEmptyStateSuggestions(quickActions), [quickActions]);

  if (!isOpen && renderClosedLauncher) {
    return (
      <SideChatWidgetRoot
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        <ClosedWidgetLauncher label={labels.title} onOpen={() => requestOpenChange(true)} />
      </SideChatWidgetRoot>
    );
  }
  if (!isOpen) return null;

  return (
    <WidgetLabelsProvider value={labels}>
      <ResizablePanel
        anchor="fixed"
        aria-label={labels.title}
        data-sidechat-accent={appearance.appearanceRootProps["data-sidechat-accent"]}
        defaultSize={panelSize}
        onSizeChange={setPanelSize}
        role="region"
        style={appearance.appearanceRootProps.style}
        theme={theme.themeId}
      >
        {isSettingsOpen ? (
          <SettingsView
            accent={appearance.accent}
            corners={appearance.corners}
            density={appearance.density}
            elevation={appearance.elevation}
            onAccentChange={appearance.setAccent}
            onBack={() => setIsSettingsOpen(false)}
            onCornersChange={appearance.setCorners}
            onDensityChange={appearance.setDensity}
            onElevationChange={appearance.setElevation}
            onSelectTheme={theme.setTheme}
            onSendWithCtrlEnterChange={sendPreference.setSendWithCtrlEnter}
            onTextSizeChange={appearance.setTextSize}
            onToolDetailChange={toolDetailPreference.setToolDetail}
            onTypefaceChange={appearance.setTypeface}
            sendWithCtrlEnter={sendPreference.sendWithCtrlEnter}
            textSize={appearance.textSize}
            themeId={theme.themeId}
            toolDetail={toolDetailPreference.toolDetail}
            typeface={appearance.typeface}
          />
        ) : (
          // Sidebar is full height; the header lives inside the main column beside it.
          <div className="flex min-h-0 flex-1">
            <div className="sc-wide-slot min-h-0 shrink-0">
              <ConversationSidebar
                conversations={chat.conversations}
                onNewConversation={chat.startNewConversation}
                onSelectConversation={chat.selectConversation}
                selectedConversationId={chat.conversationId}
                runningConversationIds={chat.runningConversationIds}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <WidgetHeader
                newConversationDisabled={isBusy && chat.conversationId === undefined}
                onClose={() => {
                  panelActions?.onClose?.();
                  requestOpenChange(false);
                }}
                onNewConversation={chat.startNewConversation}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onRefresh={chat.refresh}
                title={
                  <>
                    <span className="sc-wide-slot min-w-0">
                      <WidgetHeaderTitle title={labels.title} renderAgentMark={renderAgentMark} />
                    </span>
                    <span className="sc-narrow-slot min-w-0">
                      <ConversationSwitcher
                        conversations={chat.conversations}
                        disabled={isBusy}
                        onNewConversation={chat.startNewConversation}
                        onSelectConversation={chat.selectConversation}
                        selectedConversationId={chat.conversationId}
                        runningConversationIds={chat.runningConversationIds}
                        title={labels.title}
                      />
                    </span>
                  </>
                }
              />
              <WidgetConversation
                emptyState={
                  <WidgetEmptyState
                    assistantTitle={labels.title}
                    description={emptyStateDescription(hostBridge, labels)}
                    onSelectSuggestion={(prompt) => void chat.submitMessage(prompt)}
                    renderAgentMark={renderAgentMark}
                    suggestions={suggestions}
                    title={labels.emptyStateTitle}
                  />
                }
                notice={chat.notice}
                isLoadingHistory={chat.isLoadingHistory}
                messages={chat.messages}
                onRetry={chat.retryLastMessage}
                reasoningVisibility={reasoningVisibility}
                renderActivityItem={renderActivityItem}
                toolDetail={toolDetailPreference.toolDetail}
              />
              <WidgetFooter
                contextUsedTokens={contextTokensFromUsage(chat.usage)}
                contextWindowTokens={modelSelection.selectedModelContextWindowTokens}
                labels={labels}
                models={modelSelection.footerModels}
                onModelSelect={modelSelection.selectFooterModel}
                onReasoningEffortSelect={modelSelection.setSelectedReasoningEffort}
                onSubmitMessage={chat.submitMessage}
                onToggleTool={toolSelection.toggleTool}
                reasoningEfforts={modelSelection.reasoningEfforts}
                selectedModelKey={modelSelection.selectedFooterModelKey}
                selectedReasoningEffort={modelSelection.selectedReasoningEffort}
                sendOnEnter={!sendPreference.sendWithCtrlEnter}
                status={chat.status}
                stop={chat.stop}
                tools={toolSelection.tools}
              />
            </div>
          </div>
        )}
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
};

const resolveInitialProfileId = (
  defaultTurnProfileId: string | undefined,
  turnProfiles: readonly { readonly id: string }[],
): string | undefined => defaultTurnProfileId ?? turnProfiles.at(0)?.id;

const isBusyStatus = (status: string): boolean => status === "submitted" || status === "streaming";
