import { useState, type ReactNode } from "react";

import {
  ConversationSidebar,
  ConversationSwitcher,
  WidgetHeaderTitle,
  type ConversationSummaryView,
} from "#features/conversation";
import { WidgetHeader } from "#features/panel";
import {
  SettingsView,
  type useSendPreference,
  type useToolDetailPreference,
} from "#features/settings";
import type { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import type { WidgetLabels } from "#shared/lib/widget-labels";

export type SideChatPanelGuards = Readonly<{
  conversationSelectionDisabled: boolean;
  newConversationDisabled: boolean;
}>;

/** Keep shell-level navigation policy identical across both transports. */
export function resolveSideChatPanelGuards(): SideChatPanelGuards {
  return {
    conversationSelectionDisabled: false,
    newConversationDisabled: false,
  };
}

/** Transport-neutral settings, conversation navigation, and header shell. */
export function SideChatPanelView({
  appearance,
  content,
  conversations,
  labels,
  onClose,
  onNewConversation,
  onRefresh,
  onSelectConversation,
  renderAgentMark,
  runningConversationIds,
  selectedConversationId,
  sendPreference,
  theme,
  toolDetailPreference,
}: Readonly<{
  appearance: ReturnType<typeof useWidgetAppearance>;
  content: ReactNode;
  conversations: readonly ConversationSummaryView[];
  labels: WidgetLabels;
  onClose: () => void;
  onNewConversation: () => void;
  onRefresh: () => void;
  onSelectConversation: (conversationId: string) => void;
  renderAgentMark?: (() => ReactNode) | undefined;
  runningConversationIds: ReadonlySet<string>;
  selectedConversationId: string | undefined;
  sendPreference: ReturnType<typeof useSendPreference>;
  theme: ReturnType<typeof useWidgetTheme>;
  toolDetailPreference: ReturnType<typeof useToolDetailPreference>;
}>): ReactNode {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const guards = resolveSideChatPanelGuards();
  const selectConversation = (conversationId: string | undefined): void => {
    if (!guards.conversationSelectionDisabled && conversationId) {
      onSelectConversation(conversationId);
    }
  };
  const startNewConversation = (): void => {
    if (!guards.newConversationDisabled) onNewConversation();
  };

  if (isSettingsOpen) {
    return (
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
    );
  }

  return (
    <div className="flex min-h-0 flex-1">
      <div className="sc-wide-slot min-h-0 shrink-0">
        <ConversationSidebar
          conversationSelectionDisabled={guards.conversationSelectionDisabled}
          conversations={conversations}
          newConversationDisabled={guards.newConversationDisabled}
          onNewConversation={startNewConversation}
          onSelectConversation={selectConversation}
          runningConversationIds={runningConversationIds}
          selectedConversationId={selectedConversationId}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <WidgetHeader
          newConversationDisabled={guards.newConversationDisabled}
          onClose={onClose}
          onNewConversation={startNewConversation}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRefresh={onRefresh}
          title={
            <>
              <span className="sc-wide-slot min-w-0">
                <WidgetHeaderTitle renderAgentMark={renderAgentMark} title={labels.title} />
              </span>
              <span className="sc-narrow-slot min-w-0">
                <ConversationSwitcher
                  conversations={conversations}
                  disabled={guards.conversationSelectionDisabled}
                  onNewConversation={startNewConversation}
                  onSelectConversation={selectConversation}
                  runningConversationIds={runningConversationIds}
                  selectedConversationId={selectedConversationId}
                  title={labels.title}
                />
              </span>
            </>
          }
        />
        {content}
      </div>
    </div>
  );
}
