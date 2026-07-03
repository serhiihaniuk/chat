import type { WidgetMessage, WidgetStatus, WidgetUsage } from "#entities/chat";

/**
 * Lifecycle of one server-owned assistant run, as the widget sees it.
 *
 * `submitted` covers create-run before the first event; `streaming` once events
 * flow; `reconnecting` while a resubscribe is in flight; the rest are terminal.
 * The store owns this status so a remount or pane switch never loses it.
 */
export const WIDGET_RUN_STATUSES = {
  SUBMITTED: "submitted",
  STREAMING: "streaming",
  RECONNECTING: "reconnecting",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  // A safety-filtered turn. Terminal and distinct from FAILED so the UI shows a
  // calm guard notice with no Retry, never inviting resubmission of blocked input.
  BLOCKED: "blocked",
} as const;

export type WidgetRunStatus = (typeof WIDGET_RUN_STATUSES)[keyof typeof WIDGET_RUN_STATUSES];

const TERMINAL_RUN_STATUSES = new Set<WidgetRunStatus>([
  WIDGET_RUN_STATUSES.COMPLETED,
  WIDGET_RUN_STATUSES.FAILED,
  WIDGET_RUN_STATUSES.CANCELLED,
  WIDGET_RUN_STATUSES.BLOCKED,
]);

/** Whether a run status means generation is over and no resubscribe is needed. */
export const isTerminalRunStatus = (status: WidgetRunStatus): boolean =>
  TERMINAL_RUN_STATUSES.has(status);

/**
 * Collapse the run lifecycle into the widget's UI status.
 *
 * The composer only needs busy vs idle vs error: `reconnecting` reads as busy
 * (a stop is still meaningful), completed/cancelled/blocked are idle, and `failed`
 * is the single error surface the conversation view renders. Blocked is idle, not
 * error: it is terminal but offers no Retry, so the composer stays usable for a
 * new message while the blocked notice explains the stop.
 */
export const runStatusToWidgetStatus = (status: WidgetRunStatus): WidgetStatus => {
  switch (status) {
    case WIDGET_RUN_STATUSES.SUBMITTED:
      return "submitted";
    case WIDGET_RUN_STATUSES.STREAMING:
    case WIDGET_RUN_STATUSES.RECONNECTING:
      return "streaming";
    case WIDGET_RUN_STATUSES.FAILED:
      return "error";
    case WIDGET_RUN_STATUSES.COMPLETED:
    case WIDGET_RUN_STATUSES.CANCELLED:
    case WIDGET_RUN_STATUSES.BLOCKED:
      return "idle";
  }
};

/**
 * Identity + ordered-log projection for one run, owned by the module store.
 *
 * `localUserMessageId`/`localAssistantMessageId` are the optimistic ids the UI
 * rendered before the server answered, so events project onto the same bubbles.
 * `lastSeenSequence` (init -1) is the dedupe/replay cursor: events with
 * `sequence <= lastSeenSequence` are ignored, and reconnect resubscribes with
 * `after = lastSeenSequence`.
 */
export type WidgetRunState = {
  readonly requestId: string;
  readonly assistantTurnId: string | undefined;
  readonly conversationId: string | undefined;
  readonly localUserMessageId: string;
  readonly localAssistantMessageId: string;
  readonly status: WidgetRunStatus;
  readonly lastSeenSequence: number;
  readonly messages: readonly WidgetMessage[];
  readonly usage: WidgetUsage | undefined;
  readonly errorMessage: string | undefined;
  readonly reconnectAttempt: number;
  /** Host-command activity ids the controller has already dispatched once. */
  readonly dispatchedHostCommandIds: readonly string[];
};

export type WidgetRunSeed = {
  readonly requestId: string;
  readonly assistantTurnId?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly localUserMessageId: string;
  readonly localAssistantMessageId: string;
  readonly messages: readonly WidgetMessage[];
  readonly status?: WidgetRunStatus | undefined;
};

/** Build the initial run state for a freshly submitted (or resumed) run. */
export const createWidgetRunState = (seed: WidgetRunSeed): WidgetRunState => ({
  requestId: seed.requestId,
  assistantTurnId: seed.assistantTurnId,
  conversationId: seed.conversationId,
  localUserMessageId: seed.localUserMessageId,
  localAssistantMessageId: seed.localAssistantMessageId,
  status: seed.status ?? WIDGET_RUN_STATUSES.SUBMITTED,
  lastSeenSequence: -1,
  messages: seed.messages,
  usage: undefined,
  errorMessage: undefined,
  reconnectAttempt: 0,
  dispatchedHostCommandIds: [],
});
