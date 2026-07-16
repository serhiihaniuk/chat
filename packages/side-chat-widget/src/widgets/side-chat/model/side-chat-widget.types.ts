import type { ReactNode } from "react";

import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { RenderActivityItem, SideChatActivityItem } from "#entities/activity";
import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { WidgetThemeId } from "#entities/theme";
import type { WorkflowChatClient } from "#entities/workflow-chat";
import type { SideChatWidgetLabels } from "#shared/lib/widget-labels";

export type { RenderActivityItem, SideChatActivityItem, SideChatWidgetLabels, WidgetThemeId };

export type SideChatWidgetPanelActions = Readonly<{
  onClose?: (() => void) | undefined;
}>;

export type SideChatWidgetQuickAction = Readonly<{
  id: string;
  label: string;
  prompt: string;
}>;

export type { SideChatWidgetPanelSize };

type SideChatWidgetShellProps = Readonly<{
  defaultOpen?: boolean | undefined;
  defaultPanelSize?: SideChatWidgetPanelSize | undefined;
  defaultTheme?: WidgetThemeId | undefined;
  labels?: SideChatWidgetLabels | undefined;
  onOpenChange?: ((open: boolean) => void) | undefined;
  open?: boolean | undefined;
  panelActions?: SideChatWidgetPanelActions | undefined;
  renderClosedLauncher?: boolean | undefined;
  themeStorageKey?: string | undefined;
  panelSizeStorageKey?: string | undefined;
  renderActivityItem?: RenderActivityItem | undefined;
}>;

export type WorkflowSideChatWidgetProps = SideChatWidgetShellProps &
  Readonly<{
    workflowChat: WorkflowChatClient;
    initialConversationId?: string | undefined;
    workflowActiveTurnStorageKey?: string | undefined;
    workflowConversationSelectionStorageKey?: string | undefined;
    hostBridge?: WidgetHostBridge | undefined;
    quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
    renderAgentMark?: (() => ReactNode) | undefined;
  }>;

export type SideChatWidgetProps = WorkflowSideChatWidgetProps;
