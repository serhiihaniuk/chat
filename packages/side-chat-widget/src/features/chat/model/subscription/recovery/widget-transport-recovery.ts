import type { SidechatStreamEvent } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import { toErrorMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import {
  WIDGET_RUN_STATUSES,
  isTerminalRunStatus,
  type WidgetRunStatus,
} from "../../run/widget-run-state.js";
import type { WidgetRunStore } from "../../run/widget-run-store.js";
import { runSubscription, type SubscriptionAttemptOutcome } from "../widget-run-subscription.js";

type HostBridgeRef = Pick<HostBridge, "dispatchCommand"> | undefined;

/** Retry ladder: bounded backoff before falling back to status polling. */
const RETRY_BACKOFF_MS = [500, 1_000, 2_000, 4_000] as const;
/**
 * No stream event for this long ⇒ the connection is wedged; cut it and retry.
 *
 * Paired with the server SSE heartbeat (`SSE_HEARTBEAT_INTERVAL_MS`, ~20 s): the
 * watchdog window is deliberately more than twice that cadence, so a live stream
 * survives a couple of missed heartbeats before it is treated as wedged. The
 * heartbeat is a comment frame that the decoder drops, so it does not reset this
 * event-based timer — its job is to keep bytes flowing under a load balancer's
 * idle timeout. Today's tools are host-command round-trips (browser-fast), so an
 * event-quiet span past this window does not occur in practice; when server-side
 * tools can idle a turn longer (story 21), reset this timer on heartbeat bytes.
 */
const DEFAULT_INACTIVITY_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 2_000;
/** Consecutive status-poll failures before the run is failed locally. */
const MAX_POLL_FAILURES = 5;

const LOST_CONNECTION_MESSAGE = "Connection to the assistant was lost.";
const SERVER_FAILED_MESSAGE = "The assistant turn failed.";

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
 * Consume one turn's stream to its terminal, surviving transport failures.
 *
 * The ADR 0007 client contract: transport failures are *reconnecting*, not
 * terminal. Each attempt runs under its own AbortController (linked to the
 * caller's signal) with an inactivity watchdog, so a zombie connection is cut
 * instead of locking the composer forever. Retryable failures re-open the resume
 * GET from the store's cursor on a bounded backoff; when retries exhaust — or the
 * server says another instance owns the stream — recovery degrades to polling
 * turn status until the server reports a terminal. Only a fatal error (protocol
 * violation, 4xx) or persistent poll failure fails the run locally.
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
 * Sort a transport failure into retry / poll / fail-now.
 *
 * Dropped connections (`missing_terminal`), network errors, 5xx, and the
 * watchdog's own abort are transient — the same instance usually still owns the
 * turn. `stream_unavailable` means retrying this instance can never work, so it
 * goes straight to the status poll. Protocol violations and 4xx are fatal: the
 * stream (or this client) is wrong, not unlucky. Unknown thrown values (e.g. a
 * fetch `TypeError`) read as network trouble.
 */
type TransportErrorClass = "retryable" | "poll" | "fatal";

export const classifyTransportError = (error: unknown): TransportErrorClass => {
  if (!(error instanceof SideChatApiError)) return "retryable";
  switch (error.code) {
    case "stream_unavailable":
      return "poll";
    case "missing_terminal":
    case "network_error":
    case "aborted":
      return "retryable";
    case "http_error":
      return error.status !== undefined && error.status >= 500 ? "retryable" : "fatal";
    case "malformed_stream":
    case "replay_expired":
    // A busy conversation is a pre-start rejection, not a recoverable drop:
    // retrying or polling cannot unbusy it, so surface it as fatal.
    case "conversation_busy":
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
    const status = await readServerTurnStatus(input);
    if (status !== undefined && status !== "running") {
      input.onServerTerminal();
      input.store.dispatch(input.requestId, {
        type: "terminal",
        status: widgetStatusFromServer(status),
        ...(widgetStatusFromServer(status) === WIDGET_RUN_STATUSES.FAILED
          ? { message: SERVER_FAILED_MESSAGE }
          : {}),
      });
      return;
    }
    failures = status === undefined ? failures + 1 : 0;
    if (failures >= MAX_POLL_FAILURES) {
      failRun(input, LOST_CONNECTION_MESSAGE);
      return;
    }
    await delay(input.pollIntervalMs ?? POLL_INTERVAL_MS, input.signal);
  }
};

const readServerTurnStatus = async (input: TransportRecoveryInput): Promise<string | undefined> => {
  try {
    const result = await input.client.getTurnStatus(input.assistantTurnId, {
      signal: input.signal,
    });
    return result.status;
  } catch {
    return undefined;
  }
};

/** Map the durable turn status to the widget's terminal vocabulary. */
const widgetStatusFromServer = (status: string): WidgetRunStatus => {
  if (status === "completed") return WIDGET_RUN_STATUSES.COMPLETED;
  if (status === "user_aborted") return WIDGET_RUN_STATUSES.CANCELLED;
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
  new SideChatApiError("network_error", "No stream events arrived within the inactivity window");

const linkAbort = (outer: AbortSignal, inner: AbortController): (() => void) => {
  if (outer.aborted) {
    inner.abort(outer.reason);
    return () => undefined;
  }
  const forward = (): void => {
    inner.abort(outer.reason);
  };
  outer.addEventListener("abort", forward);
  return () => {
    outer.removeEventListener("abort", forward);
  };
};

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
