import type { ReactNode } from "react";

import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { RenderActivityItem, SideChatActivityItem } from "#entities/activity";
import type { WorkflowChatClient } from "#entities/workflow-chat";
import type { SideChatWidgetPanelSize } from "#features/panel";
import type { SideChatWidgetLabels } from "#shared/lib/widget-labels";
import type { WidgetThemeId } from "#shared/lib/widget-themes";

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
  /** Initial uncontrolled state; ignored when `open` is supplied. */
  defaultOpen?: boolean | undefined;
  defaultPanelSize?: SideChatWidgetPanelSize | undefined;
  defaultTheme?: WidgetThemeId | undefined;
  labels?: SideChatWidgetLabels | undefined;
  /** Reports uncontrolled changes or requests a new value from a controlled host. */
  onOpenChange?: ((open: boolean) => void) | undefined;
  /** Controlled open state. Pair with `onOpenChange` to accept widget requests. */
  open?: boolean | undefined;
  panelActions?: SideChatWidgetPanelActions | undefined;
  renderClosedLauncher?: boolean | undefined;
  /** Browser-local preference key; it is neither secret nor authorization scope. */
  themeStorageKey?: string | undefined;
  /** Browser-local preference key; it is neither secret nor authorization scope. */
  panelSizeStorageKey?: string | undefined;
  /** Presentation override only; it cannot change activity or tool execution. */
  renderActivityItem?: RenderActivityItem | undefined;
}>;

/** Public props for the durable Workflow-backed Side Chat widget. */
export type WorkflowSideChatWidgetProps = SideChatWidgetShellProps &
  Readonly<{
    workflowChat: WorkflowChatClient;
    /**
     * Initial selection used after same-tab active-run recovery and before a
     * stored idle selection.
     */
    initialConversationId?: string | undefined;
    /**
     * Session-storage key for same-tab run recovery. Its value can include the
     * browser-held client-tool capability and is validated against `workflowChat.scopeKey`.
     */
    workflowActiveTurnStorageKey?: string | undefined;
    /** Session-storage key for view selection only; conversation data stays server-owned. */
    workflowConversationSelectionStorageKey?: string | undefined;
    hostBridge?: WidgetHostBridge | undefined;
    quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
    renderAgentMark?: (() => ReactNode) | undefined;
  }>;

export type SideChatWidgetProps = WorkflowSideChatWidgetProps;
