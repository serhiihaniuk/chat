import type { ReactElement } from "react";

import type { SideChatWidgetController } from "./widget-controller.js";
import type {
  SideChatWidgetLabels,
  SideChatWidgetQuickAction,
} from "./widget.types.js";
import { ChatComposer } from "#features/composer/ui/chat-composer";
import { ConversationFeed } from "#features/conversation/ui/conversation-feed";
import { PanelHeader } from "#features/panel/ui/panel-header";
import { PanelShell } from "#features/panel/ui/panel-shell";
import { WidgetLauncher } from "#features/panel/ui/widget-launcher";
import { QuickActionsRow } from "#features/quick-actions/ui/quick-actions-row";

export type SideChatWidgetViewProps = {
  readonly controller: SideChatWidgetController;
  readonly labels: SideChatWidgetLabels;
  readonly quickActions: readonly SideChatWidgetQuickAction[];
};

export const SideChatWidgetView = ({
  controller,
  labels,
  quickActions,
}: SideChatWidgetViewProps): ReactElement | null => {
  if (controller.panel.state.visibility === "closed") {
    return (
      <WidgetLauncher
        launcherButtonRef={controller.panel.launcherButtonRef}
        onOpen={controller.panel.openPanel}
      />
    );
  }

  return (
    <PanelShell
      data-status={controller.conversationState.status}
      onKeyDown={controller.panel.handlePanelKeyDown}
      onResizeStart={controller.panel.startPanelResize}
      panelRef={controller.panel.panelRef}
      state={controller.panel.state}
    >
      <PanelHeader
        actions={controller.panelHeaderActions}
        expanded={controller.panel.state.mode === "expanded"}
        onDragStart={controller.panel.startPanelDrag}
        settingsOpen={controller.panel.state.settingsOpen}
        title={labels.title ?? "Workspace Assistant"}
      />
      <ConversationFeed
        onDismissError={controller.onDismissError}
        onRetry={controller.onRetry}
        state={controller.conversationState}
      />
      <QuickActionsRow
        actions={quickActions}
        disabled={controller.disabled}
        onSelect={controller.onQuickActionSelect}
      />
      <ChatComposer
        assistantProfileId={controller.assistantProfileId}
        assistantProfiles={controller.assistantProfiles}
        disabled={controller.disabled}
        labels={labels}
        onAssistantProfileChange={controller.onSelectAssistantProfile}
        onSubmit={controller.onSubmit}
        {...(controller.conversationState.usage
          ? { usage: controller.conversationState.usage }
          : {})}
      />
    </PanelShell>
  );
};
