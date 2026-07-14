import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useWidgetChat } from "#features/chat";
import {
  emptyStateDescription,
  toEmptyStateSuggestions,
  WidgetConversation,
  WidgetEmptyState,
} from "#features/conversation";
import { ClosedWidgetLauncher, ResizablePanel, useWidgetPanelSize } from "#features/panel";
import { WidgetFooter } from "#features/prompt";
import { useSendPreference, useToolDetailPreference } from "#features/settings";
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
import { SideChatPanelView } from "./panel/side-chat-panel-view.js";
import { WorkflowSideChatWidget } from "./workflow/workflow-side-chat-widget.js";

export type {
  RenderActivityItem,
  SideChatActivityItem,
  SideChatWidgetTurnProfile,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  WorkflowSideChatWidgetProps,
  SideChatWidgetQuickAction,
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
        <SideChatPanelView
          appearance={appearance}
          conversations={chat.conversations}
          content={
            <>
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
            </>
          }
          hasPersistedSelection={chat.conversationId !== undefined}
          isBusy={isBusy}
          labels={labels}
          onClose={() => {
            panelActions?.onClose?.();
            requestOpenChange(false);
          }}
          onNewConversation={chat.startNewConversation}
          onRefresh={chat.refresh}
          onSelectConversation={(conversationId) => chat.selectConversation(conversationId)}
          renderAgentMark={renderAgentMark}
          runningConversationIds={chat.runningConversationIds}
          selectedConversationId={chat.conversationId}
          sendPreference={sendPreference}
          theme={theme}
          toolDetailPreference={toolDetailPreference}
        />
      </ResizablePanel>
    </WidgetLabelsProvider>
  );
};

const resolveInitialProfileId = (
  defaultTurnProfileId: string | undefined,
  turnProfiles: readonly { readonly id: string }[],
): string | undefined => defaultTurnProfileId ?? turnProfiles.at(0)?.id;

const isBusyStatus = (status: string): boolean => status === "submitted" || status === "streaming";
