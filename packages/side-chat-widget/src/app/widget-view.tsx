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
}: SideChatWidgetViewProps): ReactElement | null => (
  <PanelShell
    data-status={controller.conversationState.status}
    state={controller.panelState}
  >
    <PanelHeader
      actions={controller.panelHeaderActions}
      title={labels.title ?? "Workspace Assistant"}
    />
    <ConversationFeed state={controller.conversationState} />
    <QuickActionsRow
      actions={quickActions}
      disabled={controller.disabled}
      onSelect={controller.onQuickActionSelect}
    />
    <ChatComposer
      disabled={controller.disabled}
      labels={labels}
      onSubmit={controller.onSubmit}
    />
  </PanelShell>
);
