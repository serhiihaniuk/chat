import type { ReactNode } from "react";

import type { WidgetHostBridge } from "@side-chat/host-bridge";

import type { WidgetActivityItem } from "#entities/chat";
import type { SideChatApiClient } from "#entities/conversation";
import type { SideChatWidgetPanelSize } from "#entities/panel";
import type { ReasoningVisibility } from "#entities/settings";
import type { WidgetThemeId } from "#entities/theme";
import type { WorkflowChatClient } from "#entities/workflow-chat";
import type { RenderActivityItem } from "#features/conversation";
import type { SideChatWidgetLabels } from "#shared/lib/widget-labels";

export type {
  ReasoningVisibility,
  RenderActivityItem,
  SideChatWidgetLabels,
  WidgetActivityItem,
  WidgetThemeId,
};

/** Optional host-owned actions exposed through the widget panel chrome. */
export type SideChatWidgetPanelActions = {
  readonly onClose?: (() => void) | undefined;
};

/** One starter prompt rendered in the widget's empty conversation state. */
export type SideChatWidgetQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
};

/** Host-facing label and id for a backend-configured turn profile. */
export type SideChatWidgetTurnProfile = {
  readonly id: string;
  readonly label: string;
};

export type { SideChatWidgetPanelSize };

/** Panel and appearance options supported by every widget transport branch. */
type SideChatWidgetShellProps = {
  /**
   * Initial panel state for the widget-owned launcher flow.
   *
   * Host-controlled iframe integrations should pass `open` instead. In that
   * mode this value is ignored after mount, and the host owns every visible
   * open/closed transition.
   */
  readonly defaultOpen?: boolean | undefined;
  /** Initial floating-panel dimensions before a persisted size is restored. */
  readonly defaultPanelSize?: SideChatWidgetPanelSize | undefined;
  /** Initial named light theme before a persisted theme is restored. */
  readonly defaultTheme?: WidgetThemeId | undefined;
  /** Partial replacement for the widget's built-in user-facing copy. */
  readonly labels?: SideChatWidgetLabels | undefined;
  /** Receives requested open-state changes in controlled and uncontrolled modes. */
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
  /**
   * Whether Side Chat renders its internal closed-state launcher.
   *
   * Host iframe integrations usually set this to `false` because the host app
   * owns the button that opens and closes the frame.
   */
  readonly renderClosedLauncher?: boolean | undefined;
  /** Browser-local key for the selected named theme. */
  readonly themeStorageKey?: string | undefined;
  /**
   * Browser-local key under which the resizable panel's size is persisted, so a
   * refresh or fresh iframe load restores the size the user dragged to. Defaults
   * to a shared key when omitted; pass a workspace-scoped key to isolate hosts.
   */
  readonly panelSizeStorageKey?: string | undefined;
};

/** Configuration owned by the protocol-backed conversation and activity model. */
type ProtocolSideChatWidgetOptions = {
  /** Profiles offered by the host when no backend model catalog drives selection. */
  readonly turnProfiles?: readonly SideChatWidgetTurnProfile[] | undefined;
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
  /** Initially selected profile id; falls back to the first supplied profile. */
  readonly defaultTurnProfileId?: string | undefined;
  /** Optional page-context and host-command seam supplied by the embedding app. */
  readonly hostBridge?: WidgetHostBridge | undefined;
  /** Starter prompts shown only before the selected conversation has messages. */
  readonly quickActions?: readonly SideChatWidgetQuickAction[] | undefined;
  /**
   * Host/server-controlled reasoning presentation, not a user preference.
   * Defaults to `minimal`; `detailed` expands completed reasoning while live
   * reasoning still opens only after the stream emits an activity trace.
   */
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
};

export type ProtocolSideChatWidgetProps = SideChatWidgetShellProps &
  ProtocolSideChatWidgetOptions & {
    /** Browser repository for the protocol-backed transport. */
    readonly client: SideChatApiClient;
    readonly workflowChat?: never;
  };

export type WorkflowSideChatWidgetProps = SideChatWidgetShellProps & {
  readonly client?: never;
  /** Native AI SDK transport and dynamic request configuration for one conversation. */
  readonly workflowChat: WorkflowChatClient;
};

/**
 * Public configuration for one embeddable Side Chat instance.
 *
 * A caller selects exactly one transport branch. The native workflow branch
 * never imports or executes the protocol-backed run machinery.
 */
export type SideChatWidgetProps = ProtocolSideChatWidgetProps | WorkflowSideChatWidgetProps;
