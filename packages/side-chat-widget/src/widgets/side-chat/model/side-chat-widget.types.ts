import type { ReactNode } from "react";

import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { WidgetActivityItem } from "#entities/chat";
import type { ReasoningVisibility } from "#entities/settings";
import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { WidgetThemeId } from "#entities/theme";
import type { SideChatApiClient } from "#entities/conversation";
import type { RenderActivityItem } from "#features/conversation";
import type { SideChatWidgetLabels } from "#shared/lib/widget-labels";

export type {
  ReasoningVisibility,
  RenderActivityItem,
  SideChatWidgetLabels,
  WidgetActivityItem,
  WidgetThemeId,
};

export type SideChatWidgetPanelActions = {
  readonly onClose?: (() => void) | undefined;
};

export type SideChatWidgetQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

export type SideChatWidgetTurnProfile = {
  readonly id: string;
  readonly label: string;
};

export type { SideChatWidgetPanelSize };

export type SideChatWidgetProps = {
  readonly turnProfiles?: readonly SideChatWidgetTurnProfile[] | undefined;
  readonly client: SideChatApiClient;
  /**
   * Browser-local namespace for this widget's conversation state and live run.
   *
   * Two Side Chat widgets on one page against the same service MUST pass distinct
   * keys: the key namespaces both localStorage and the module-scoped run store, so
   * a shared (or omitted) key makes them share one conversation and clobber each
   * other's live turn. Widgets pointed at different services are already isolated
   * by their client `baseUrl`.
   */
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
  /**
   * Custom rendering for one activity item (tool call, host command, reasoning
   * row) in the message trace. Return a node to replace only that item's
   * default rendering; return `undefined` to keep the default. A rendering
   * seam only — protocol projection and host-command dispatch are unaffected.
   */
  readonly renderActivityItem?: RenderActivityItem | undefined;
  /**
   * Replace the built-in agent mark (the greeting + header glyph) with custom
   * branding. Returns a node rendered in place of the default `AgentMark`; omit to
   * keep it.
   */
  readonly renderAgentMark?: (() => ReactNode) | undefined;
  readonly themeStorageKey?: string | undefined;
  /**
   * Browser-local key under which the resizable panel's size is persisted, so a
   * refresh or fresh iframe load restores the size the user dragged to. Defaults
   * to a shared key when omitted; pass a workspace-scoped key to isolate hosts.
   */
  readonly panelSizeStorageKey?: string | undefined;
};
