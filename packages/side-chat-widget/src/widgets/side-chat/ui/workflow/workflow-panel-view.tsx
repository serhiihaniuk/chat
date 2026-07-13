import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import {
  ConversationSidebar,
  ConversationSwitcher,
  WidgetHeaderTitle,
  type ConversationSummaryView,
} from "#features/conversation";
import { WidgetHeader } from "#features/panel";
import { SettingsView } from "#features/settings";
import type { useSendPreference, useToolDetailPreference } from "#features/settings";
import type { useWidgetAppearance, useWidgetTheme } from "#features/theme";
import type { resolveWidgetLabels } from "#shared/lib/widget-labels";

import type { WorkflowSideChatWidgetProps } from "../../model/side-chat-widget.types.js";

// The native path knows only the active conversation's run state (discovery is
// per-conversation), so the sidebar's per-conversation "running" dot stays empty.
const NO_RUNNING_CONVERSATIONS: ReadonlySet<string> = new Set();

const newConversationId = (): string => crypto.randomUUID();

/**
 * The panel's inner chrome: the settings view, or the conversation sidebar plus
 * the header (with the narrow-mode switcher) and the active conversation feed.
 * Owns `isSettingsOpen` and the new/select conversation actions.
 */
export function WorkflowPanelView({
  activeConversationId,
  appearance,
  conversations,
  historyContent,
  labels,
  onClose,
  renderAgentMark,
  sendPreference,
  setActiveConversationId,
  theme,
  toolDetailPreference,
}: {
  readonly activeConversationId: string;
  readonly appearance: ReturnType<typeof useWidgetAppearance>;
  readonly conversations: readonly ConversationSummaryView[];
  readonly historyContent: ReactNode;
  readonly labels: ReturnType<typeof resolveWidgetLabels>;
  readonly onClose: () => void;
  readonly renderAgentMark: WorkflowSideChatWidgetProps["renderAgentMark"];
  readonly sendPreference: ReturnType<typeof useSendPreference>;
  readonly setActiveConversationId: Dispatch<SetStateAction<string>>;
  readonly theme: ReturnType<typeof useWidgetTheme>;
  readonly toolDetailPreference: ReturnType<typeof useToolDetailPreference>;
}): ReactNode {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const startNewConversation = (): void => setActiveConversationId(newConversationId());
  const selectConversation = (conversationId: string | undefined): void => {
    if (conversationId) setActiveConversationId(conversationId);
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

  // Sidebar is full height; the header lives inside the main column beside it.
  return (
    <div className="flex min-h-0 flex-1">
      <div className="sc-wide-slot min-h-0 shrink-0">
        <ConversationSidebar
          conversations={conversations}
          onNewConversation={startNewConversation}
          onSelectConversation={selectConversation}
          runningConversationIds={NO_RUNNING_CONVERSATIONS}
          selectedConversationId={activeConversationId}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <WidgetHeader
          onClose={onClose}
          onNewConversation={startNewConversation}
          onOpenSettings={() => setIsSettingsOpen(true)}
          title={
            <>
              <span className="sc-wide-slot min-w-0">
                <WidgetHeaderTitle renderAgentMark={renderAgentMark} title={labels.title} />
              </span>
              <span className="sc-narrow-slot min-w-0">
                <ConversationSwitcher
                  conversations={conversations}
                  disabled={false}
                  onNewConversation={startNewConversation}
                  onSelectConversation={selectConversation}
                  runningConversationIds={NO_RUNNING_CONVERSATIONS}
                  selectedConversationId={activeConversationId}
                  title={labels.title}
                />
              </span>
            </>
          }
        />
        {historyContent}
      </div>
    </div>
  );
}
