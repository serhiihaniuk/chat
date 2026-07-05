import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useWidgetChat } from "#features/chat";
import {
  ConversationSidebar,
  ConversationSwitcher,
  WidgetConversation,
  WidgetEmptyState,
  WidgetHeaderTitle,
  type WidgetEmptyStateSuggestion,
} from "#features/conversation";
import {
  ClosedWidgetLauncher,
  ResizablePanel,
  useWidgetPanelSize,
  WidgetHeader,
} from "#features/panel";
import { WidgetFooter } from "#features/prompt";
import { SettingsView, useSendPreference } from "#features/settings";
import { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import { contextTokensFromUsage } from "#entities/chat";
import { DEFAULT_REASONING_VISIBILITY } from "#entities/settings";
import { SideChatWidgetRoot } from "#shared/ui/widget-root";
import { Code2Icon, FileTextIcon, LightbulbIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import { useWidgetModelSelection } from "../model/selection/side-chat-model-selection.js";
import { useWidgetToolSelection } from "../model/selection/side-chat-tool-selection.js";
import { createSideChatWidgetQueryClient } from "../model/side-chat-query-client.js";
import type { SideChatWidgetLabels, SideChatWidgetProps } from "../model/side-chat-widget.types.js";

export type {
  RenderActivityItem,
  SideChatWidgetTurnProfile,
  SideChatWidgetLabels,
  SideChatWidgetPanelActions,
  SideChatWidgetPanelSize,
  SideChatWidgetProps,
  SideChatWidgetQuickAction,
  WidgetActivityItem,
} from "../model/side-chat-widget.types.js";

const defaultLabels = {
  placeholder: "Ask anything...",
  send: "Send",
  title: "Workspace Assistant",
} satisfies Required<SideChatWidgetLabels>;

const EMPTY_STATE_DESCRIPTION =
  "I can see the page you're viewing. Ask about it, or pick a place to start.";
const EMPTY_STATE_TITLE = "How can I help with this page?";

// A small rotation so suggestion rows read as distinct actions without requiring the
// host to supply per-action icons.
const SUGGESTION_ICONS: readonly LucideIcon[] = [
  FileTextIcon,
  LightbulbIcon,
  Code2Icon,
  PenLineIcon,
];

export const SideChatWidget = (props: SideChatWidgetProps) => {
  const [queryClient] = useState(createSideChatWidgetQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <SideChatWidgetContent {...props} />
    </QueryClientProvider>
  );
};

const SideChatWidgetContent = ({
  turnProfiles = [],
  client,
  conversationStorageKey,
  defaultTurnProfileId,
  defaultOpen = true,
  defaultPanelSize,
  defaultTheme,
  hostBridge,
  labels,
  onOpenChange,
  open,
  panelActions,
  panelSizeStorageKey,
  quickActions = [],
  renderActivityItem,
  renderClosedLauncher = true,
  reasoningVisibility = DEFAULT_REASONING_VISIBILITY,
  themeStorageKey,
}: SideChatWidgetProps) => {
  const resolvedLabels = resolveWidgetLabels(labels);
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
        <ClosedWidgetLauncher label={resolvedLabels.title} onOpen={() => requestOpenChange(true)} />
      </SideChatWidgetRoot>
    );
  }
  if (!isOpen) return null;

  return (
    <ResizablePanel
      anchor="fixed"
      aria-label={resolvedLabels.title}
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
          onTypefaceChange={appearance.setTypeface}
          sendWithCtrlEnter={sendPreference.sendWithCtrlEnter}
          textSize={appearance.textSize}
          themeId={theme.themeId}
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
                    <WidgetHeaderTitle title={resolvedLabels.title} />
                  </span>
                  <span className="sc-narrow-slot min-w-0">
                    <ConversationSwitcher
                      conversations={chat.conversations}
                      disabled={isBusy}
                      onNewConversation={chat.startNewConversation}
                      onSelectConversation={chat.selectConversation}
                      selectedConversationId={chat.conversationId}
                      runningConversationIds={chat.runningConversationIds}
                      title={resolvedLabels.title}
                    />
                  </span>
                </>
              }
            />
            <WidgetConversation
              emptyState={
                <WidgetEmptyState
                  assistantTitle={resolvedLabels.title}
                  description={EMPTY_STATE_DESCRIPTION}
                  onSelectSuggestion={(prompt) => void chat.submitMessage(prompt)}
                  suggestions={suggestions}
                  title={EMPTY_STATE_TITLE}
                />
              }
              notice={chat.notice}
              isLoadingHistory={chat.isLoadingHistory}
              messages={chat.messages}
              onRetry={chat.retryLastMessage}
              reasoningVisibility={reasoningVisibility}
              renderActivityItem={renderActivityItem}
            />
            <WidgetFooter
              contextUsedTokens={contextTokensFromUsage(chat.usage)}
              contextWindowTokens={modelSelection.selectedModelContextWindowTokens}
              labels={resolvedLabels}
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
  );
};

const toEmptyStateSuggestions = (
  quickActions: readonly { readonly id: string; readonly label: string; readonly prompt: string }[],
): readonly WidgetEmptyStateSuggestion[] =>
  quickActions.map((action, index) => ({
    ...action,
    icon: SUGGESTION_ICONS[index % SUGGESTION_ICONS.length]!,
  }));

const resolveWidgetLabels = (labels: SideChatWidgetLabels | undefined) => ({
  placeholder: labels?.placeholder ?? defaultLabels.placeholder,
  send: labels?.send ?? defaultLabels.send,
  title: labels?.title ?? defaultLabels.title,
});

const resolveInitialProfileId = (
  defaultTurnProfileId: string | undefined,
  turnProfiles: readonly { readonly id: string }[],
): string | undefined => defaultTurnProfileId ?? turnProfiles.at(0)?.id;

const isBusyStatus = (status: string): boolean => status === "submitted" || status === "streaming";
