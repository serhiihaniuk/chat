import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { ReasoningVisibility } from "#entities/settings";
import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { WidgetThemeId } from "#entities/theme";
import type { SideChatApiClient } from "#entities/conversation";

export type { ReasoningVisibility, WidgetThemeId };

export type SideChatWidgetLabels = {
  readonly placeholder?: string | undefined;
  readonly send?: string | undefined;
  readonly title?: string | undefined;
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: (() => void) | undefined;
  readonly onMinimize?: (() => void) | undefined;
};

export type SideChatWidgetQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type SideChatWidgetStateSnapshot = Record<string, never>;

export type SideChatWidgetTurnProfile = {
  readonly id: string;
  readonly label: string;
};

export type { SideChatWidgetPanelSize };

export type SideChatWidgetProps = {
  readonly turnProfiles?: readonly SideChatWidgetTurnProfile[] | undefined;
  readonly client: SideChatApiClient;
  readonly conversationStorageKey?: string | undefined;
  readonly defaultTurnProfileId?: string | undefined;
  /**
   * Initial panel state for the widget-owned launcher flow.
   *
   * Host-controlled iframe integrations should pass `open` instead. In that
   * mode this value is ignored after mount, and the host owns every visible
   * open/closed transition.
   */
  readonly defaultOpen?: boolean | undefined;
  readonly defaultPanelSize?: SideChatWidgetPanelSize | undefined;
  readonly defaultTheme?: WidgetThemeId | undefined;
  readonly hostBridge?: WidgetHostBridge | undefined;
  readonly initialState?: SideChatWidgetStateSnapshot | undefined;
  readonly labels?: SideChatWidgetLabels | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  /**
   * Controlled panel state supplied by the host embedding surface.
   *
   * When present, close/open controls only request changes through
   * `onOpenChange`; callers must pass the next `open` value back. This lets an
   * iframe host render its own launcher button outside the Side Chat frame.
   */
  readonly open?: boolean | undefined;
  readonly panelActions?: SideChatWidgetPanelActions | undefined;
  readonly quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
  /**
   * Whether Side Chat renders its internal closed-state launcher.
   *
   * Host iframe integrations usually set this to `false` because the host app
   * owns the button that opens and closes the frame.
   */
  readonly renderClosedLauncher?: boolean | undefined;
  // Host/server-configured: live thinking opens while streaming only after the
  // stream emits an activity trace; completed reasoning defaults to collapsed
  // for "minimal" and expanded for "detailed". Defaults to "minimal". Not a
  // user-facing setting.
  readonly reasoningVisibility?: ReasoningVisibility | undefined;
  readonly themeStorageKey?: string | undefined;
  /**
   * Browser-local key under which the resizable panel's size is persisted, so a
   * refresh or fresh iframe load restores the size the user dragged to. Defaults
   * to a shared key when omitted; pass a workspace-scoped key to isolate hosts.
   */
  readonly panelSizeStorageKey?: string | undefined;
};
