import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import { toErrorMessage } from "#entities/chat";
import {
  SIDE_CHAT_API_ERROR_CODES,
  SideChatApiError,
  type SideChatApiClient,
} from "#entities/conversation";
import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  type WidgetRunStatus,
} from "../../run/widget-run-state.js";
import type { WidgetRunStore } from "../../run/widget-run-store.js";
import { linkAbort } from "./link-abort.js";
import { runSubscription, type SubscriptionAttemptOutcome } from "../widget-run-subscription.js";

type HostBridgeRef = Pick<HostBridge, "dispatchCommand"> | undefined;

/** Retry ladder: bounded backoff before falling back to status polling. */
const RETRY_BACKOFF_MS = [500, 1_000, 2_000, 4_000] as const;
/**
 * Cut and retry when no stream event arrives for this long.
 *
 * The 45-second window tolerates a few missed 20-second SSE heartbeats.
 * Heartbeats keep the connection alive but are discarded by the decoder, so they
 * do not reset this event timer. A quiet model or server tool may therefore
 * trigger safe reconnect and status polling while generation continues.
 */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 2_000;
/** Consecutive status-poll failures before the run is failed locally. */
const MAX_POLL_FAILURES = 5;

const LOST_CONNECTION_MESSAGE = "Connection to the assistant was lost.";
const SERVER_FAILED_MESSAGE = "The assistant turn failed.";
const SERVER_TURN_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  USER_ABORTED: "user_aborted",
} as const;

/** The first attempt's pre-acquired stream (the `createRun` POST body) + its owner. */
export type InitialStreamAttempt = {
  readonly events: AsyncIterable<SidechatStreamEvent>;
  /** Controls the POST connection, so the watchdog can cut a wedged first attempt. */
  readonly controller: AbortController;
};

export type TransportRecoveryInput = {
  readonly client: SideChatApiClient;
  readonly store: WidgetRunStore;
  readonly hostBridge: HostBridgeRef;
  readonly requestId: string;
  readonly assistantTurnId: string;
  /** User intent: aborting this stops recovery silently (cancel, clear, new run). */
  readonly signal: AbortSignal;
  readonly initialAttempt?: InitialStreamAttempt | undefined;
  readonly inactivityTimeoutMs?: number | undefined;
  /** Retry/poll cadence overrides (tests); production uses the module defaults. */
  readonly retryBackoffMs?: readonly number[] | undefined;
  readonly pollIntervalMs?: number | undefined;
  /** The stream buffer is gone; the caller falls back to conversation history. */
  readonly onReplayExpired: () => void;
  /** The server (via status poll) confirmed the terminal; clear the run marker. */
  readonly onServerTerminal: () => void;
};

/**
 * Consume one turn's stream and recover from transport failures.
 *
 * A broken connection means `reconnecting`, not terminal. Each attempt has its
 * own abort controller and inactivity watchdog, so a stuck connection is cut.
 * Retryable failures reopen the stream from the store's cursor. If retries run
 * out, or another instance owns the stream, poll turn status instead. Only a
 * protocol/4xx error or a failed status poll marks the local run as failed.
 */
export const consumeTurnStreamWithRecovery = async (
  input: TransportRecoveryInput,
): Promise<void> => {
  const backoff = input.retryBackoffMs ?? RETRY_BACKOFF_MS;
  let initialAttempt = input.initialAttempt;
  for (let retries = 0; !isRecoveryOver(input); retries += 1) {
    const outcome = await runRecoveryAttempt(input, initialAttempt);
    initialAttempt = undefined;
    const step = decideNextStep(input, outcome, retries >= backoff.length);
    if (step === "stop") return;
    if (step === "poll") return pollUntilServerTerminal(input);
    input.store.dispatch(input.requestId, { type: "reconnect-started" });
    await delay(backoff[retries] ?? 4_000, input.signal);
  }
};

/**
 * Turn one attempt's outcome into the loop's next move, applying side effects
 * for the terminal cases (replay fallback, fatal failure) as they are decided.
 */
const decideNextStep = (
  input: TransportRecoveryInput,
  outcome: SubscriptionAttemptOutcome,
  retriesExhausted: boolean,
): "stop" | "poll" | "retry" => {
  if (input.signal.aborted || outcome.kind === "ended") return "stop";
  if (outcome.kind === "replay-expired") {
    input.onReplayExpired();
    return "stop";
  }
  const error = outcome.kind === "error" ? outcome.error : wedgedConnectionError();
  switch (classifyTransportError(error)) {
    case "fatal":
      failRun(input, toErrorMessage(error));
      return "stop";
    case "poll":
      return "poll";
    case "retryable":
      return retriesExhausted ? "poll" : "retry";
  }
};

/**
 * Classify a transport failure as retry, poll, or fail-now.
 *
 * Missing terminals, network errors, 5xx responses, and watchdog aborts are
 * transient. `stream_unavailable` goes straight to status polling because this
 * instance cannot serve the stream. Protocol errors and 4xx responses are
 * fatal. Unknown thrown values are treated as network errors.
 */
type TransportErrorClass = "retryable" | "poll" | "fatal";

export const classifyTransportError = (error: unknown): TransportErrorClass => {
  if (!(error instanceof SideChatApiError)) return "retryable";
  switch (error.code) {
    case SIDE_CHAT_API_ERROR_CODES.STREAM_UNAVAILABLE:
      return "poll";
    case SIDE_CHAT_API_ERROR_CODES.MISSING_TERMINAL:
    case SIDE_CHAT_API_ERROR_CODES.NETWORK_ERROR:
    case SIDE_CHAT_API_ERROR_CODES.ABORTED:
      return "retryable";
    case SIDE_CHAT_API_ERROR_CODES.HTTP_ERROR:
      return error.status !== undefined && error.status >= 500 ? "retryable" : "fatal";
    case SIDE_CHAT_API_ERROR_CODES.MALFORMED_STREAM:
    case SIDE_CHAT_API_ERROR_CODES.REPLAY_EXPIRED:
    // A busy conversation is a pre-start rejection, not a recoverable drop:
    // retrying or polling cannot unbusy it, so surface it as fatal.
    case SIDE_CHAT_API_ERROR_CODES.CONVERSATION_BUSY:
      return "fatal";
  }
};

/** Run one attempt under its own controller + watchdog, resuming from the cursor. */
const runRecoveryAttempt = async (
  input: TransportRecoveryInput,
  initialAttempt: InitialStreamAttempt | undefined,
): Promise<SubscriptionAttemptOutcome> => {
  const controller = initialAttempt?.controller ?? new AbortController();
  const unlink = linkAbort(input.signal, controller);
  const watchdog = createInactivityWatchdog(
    controller,
    input.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS,
  );
  try {
    return await runSubscription({
      client: input.client,
      store: input.store,
      hostBridge: input.hostBridge,
      requestId: input.requestId,
      assistantTurnId: input.assistantTurnId,
      events: initialAttempt?.events,
      after: resumeCursor(input),
      signal: controller.signal,
      onEvent: watchdog.touch,
    });
  } finally {
    watchdog.stop();
    unlink();
  }
};

/**
 * Poll the durable turn status until the server reports a terminal (any instance
 * can answer — it is a plain DB read). Only the SERVER's verdict fails the run;
 * polling itself failing persistently is the one local failure left.
 */
const pollUntilServerTerminal = async (input: TransportRecoveryInput): Promise<void> => {
  input.store.dispatch(input.requestId, { type: "reconnect-started" });
  let failures = 0;
  while (!isRecoveryOver(input)) {
    const step = await readServerPollStep(input);
    if (step.kind === "terminal") {
      settleServerTerminal(input, step.status);
      return;
    }
    failures = step.kind === "failed" ? failures + 1 : 0;
    if (failures >= MAX_POLL_FAILURES) {
      failRun(input, LOST_CONNECTION_MESSAGE);
      return;
    }
    await delay(input.pollIntervalMs ?? POLL_INTERVAL_MS, input.signal);
  }
};

type ServerPollStep =
  | { readonly kind: "running" }
  | { readonly kind: "failed" }
  | { readonly kind: "terminal"; readonly status: WidgetRunStatus };

const readServerPollStep = async (input: TransportRecoveryInput): Promise<ServerPollStep> => {
  try {
    const result = await input.client.getTurnStatus(input.assistantTurnId, {
      signal: input.signal,
    });
    return result.status === SERVER_TURN_STATUSES.RUNNING
      ? { kind: "running" }
      : { kind: "terminal", status: widgetStatusFromServer(result.status) };
  } catch {
    return { kind: "failed" };
  }
};

const settleServerTerminal = (input: TransportRecoveryInput, status: WidgetRunStatus): void => {
  input.onServerTerminal();
  if (status === WIDGET_RUN_STATUSES.FAILED) {
    input.store.dispatch(input.requestId, {
      type: "terminal",
      status,
      message: SERVER_FAILED_MESSAGE,
    });
    return;
  }
  input.store.dispatch(input.requestId, { type: "terminal", status });
};

/** Map the durable turn status to the widget's terminal vocabulary. */
const widgetStatusFromServer = (status: string): WidgetRunStatus => {
  if (status === SERVER_TURN_STATUSES.COMPLETED) return WIDGET_RUN_STATUSES.COMPLETED;
  if (status === SERVER_TURN_STATUSES.USER_ABORTED) return WIDGET_RUN_STATUSES.CANCELLED;
  return WIDGET_RUN_STATUSES.FAILED;
};

/** Recovery ends when the caller aborted or the run settled underneath it (cancel, clear, replaced). */
const isRecoveryOver = (input: TransportRecoveryInput): boolean => {
  if (input.signal.aborted) return true;
  const run = input.store.getSnapshot();
  return !run || run.requestId !== input.requestId || isTerminalRunStatus(run.status);
};

const failRun = (input: TransportRecoveryInput, message: string): void => {
  input.store.dispatch(input.requestId, { type: "stream-failed", message });
};

const resumeCursor = (input: TransportRecoveryInput): number => {
  const run = input.store.getSnapshot();
  return run && run.requestId === input.requestId ? run.lastSeenSequence : -1;
};

/** The watchdog aborted a live-but-silent connection: report it as a network stall. */
const wedgedConnectionError = (): SideChatApiError =>
  new SideChatApiError(
    SIDE_CHAT_API_ERROR_CODES.NETWORK_ERROR,
    "No stream events arrived within the inactivity window",
  );

/**
 * Abort the attempt's controller when no event arrives within the window.
 *
 * Aborting (rather than throwing around the iterator) actually closes the wedged
 * connection; the attempt then reports `aborted`, and the recovery loop — seeing
 * its own signal untouched — knows the watchdog fired and retries.
 */
const createInactivityWatchdog = (
  controller: AbortController,
  timeoutMs: number,
): { readonly touch: () => void; readonly stop: () => void } => {
  const fire = (): void => {
    controller.abort(wedgedConnectionError());
  };
  let timer = setTimeout(fire, timeoutMs);
  return {
    touch: () => {
      clearTimeout(timer);
      timer = setTimeout(fire, timeoutMs);
    },
    stop: () => {
      clearTimeout(timer);
    },
  };
};

const delay = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      signal.removeEventListener("abort", done);
      clearTimeout(timer);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
