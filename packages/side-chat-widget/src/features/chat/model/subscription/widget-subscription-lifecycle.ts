import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import type { WidgetMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { runErrorMessage } from "../run/widget-run-reducer.js";
import { WIDGET_RUN_STATUSES, type WidgetRunState } from "../run/widget-run-state.js";
import type { WidgetRunStore } from "../run/widget-run-store.js";
import { clearActiveRunMarker, writeActiveRunMarker } from "../reconnect/widget-run-marker.js";
import {
  consumeTurnStreamWithRecovery,
  type InitialStreamAttempt,
} from "./recovery/widget-transport-recovery.js";

export type HostBridgeRef = Pick<HostBridge, "dispatchCommand"> | undefined;

export type StartRunInput = {
  readonly request: ChatStreamRequest;
  readonly localUserMessageId: string;
  readonly localAssistantMessageId: string;
  readonly messages: readonly WidgetMessage[];
};

/** Identity + storage context the lifecycle helpers need to drive the transport. */
export type RunLifecycleContext = {
  readonly client: SideChatApiClient;
  readonly hostBridge: HostBridgeRef;
  readonly conversationStorageKey: string | undefined;
  readonly onReplayExpired: (conversationId: string | undefined) => void;
  /** Refetch one conversation's stored transcript (e.g. a turn finished while away). */
  readonly refreshHistory: (conversationId: string | undefined) => void | Promise<unknown>;
  /** Watchdog window: no stream event for this long cuts and retries the connection. */
  readonly inactivityTimeoutMs?: number | undefined;
};

export type SubscribeTarget = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly conversationId: string | undefined;
  readonly resuming: boolean;
};

/** One in-flight subscription's abort handle, keyed by the turn it tails. */
export type ActiveSubscription = {
  controller: AbortController | undefined;
  turnId: string | undefined;
};

/**
 * Open a subscription for one turn, replacing any other turn's subscription.
 *
 * Returns `undefined` (no-op) when a subscription for the same turn is already
 * live, so repeated reconnect triggers (mount + visibility + select) never abort
 * a healthy stream. A different turn id aborts the old one first. A wedged
 * same-turn connection is not this guard's problem: the recovery watchdog cuts
 * and retries it, so "already live" can be trusted.
 */
export const openSubscription = (
  active: ActiveSubscription,
  turnId: string,
): AbortSignal | undefined => {
  if (active.turnId === turnId && active.controller && !active.controller.signal.aborted) {
    return undefined;
  }
  active.controller?.abort();
  const controller = new AbortController();
  active.controller = controller;
  active.turnId = turnId;
  return controller.signal;
};

export const abortSubscription = (active: ActiveSubscription): void => {
  active.controller?.abort();
  active.controller = undefined;
  active.turnId = undefined;
};

/** Clear the slot without aborting (the subscription already ended on its own). */
export const releaseSubscription = (active: ActiveSubscription): void => {
  active.controller = undefined;
  active.turnId = undefined;
};

/** Abort + slot bookkeeping the controller hands `beginRun` for one fresh run. */
export type BeginRunControl = {
  readonly signal: AbortSignal;
  /** Record the canonical turn id on the slot once the identity frame arrives. */
  readonly onIdentified: (assistantTurnId: string) => void;
};

/**
 * Start the run and consume its stream on the same POST connection (ADR 0007).
 *
 * `createRun` retries pre-stream failures under the request idempotency key;
 * once the stream is open, its identity (the `sidechat.started` frame) seeds the
 * store and marker, and the same connection is drained to the terminal — no
 * separate subscribe call. Create failures (no `sidechat.started` was ever seen)
 * fail the run as a request-level error; the optimistic bubbles stay so the user
 * sees the prompt with an error rather than a vanished message.
 */
export const beginRun = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  control: BeginRunControl,
  startInput: StartRunInput,
): Promise<void> => {
  const { requestId } = startInput.request;
  store.start({
    requestId,
    localUserMessageId: startInput.localUserMessageId,
    localAssistantMessageId: startInput.localAssistantMessageId,
    messages: startInput.messages,
  });

  // The POST connection gets its own controller (linked to the caller's signal)
  // so the recovery watchdog can cut a wedged first attempt without touching the
  // caller's slot — an outer abort still stops everything.
  const connection = new AbortController();
  const unlink = forwardAbort(control.signal, connection);

  let run;
  try {
    run = await context.client.createRun(startInput.request, { signal: connection.signal });
  } catch (error) {
    unlink();
    if (control.signal.aborted || isAbortApiError(error)) return;
    // A replayed requestId whose finished turn was already swept: the answer
    // lives in history, so fall back instead of rendering a false failure.
    if (isReplayExpiredError(error)) {
      clearActiveRunMarker(context.conversationStorageKey);
      store.clear();
      context.onReplayExpired(undefined);
      return;
    }
    store.dispatch(requestId, { type: "stream-failed", message: runErrorMessage(error) });
    return;
  }
  unlink();

  control.onIdentified(run.assistantTurnId);
  store.dispatch(requestId, { type: "identified", assistantTurnId: run.assistantTurnId });
  // Written exactly once per run; cleared only on a server-confirmed terminal or
  // a replaced run — never on a transport failure, so a reload can still resume.
  writeActiveRunMarker(context.conversationStorageKey, {
    requestId,
    assistantTurnId: run.assistantTurnId,
    conversationId: run.conversationId,
  });

  await consumeTurnStreamWithRecovery({
    client: context.client,
    store,
    hostBridge: context.hostBridge,
    requestId,
    assistantTurnId: run.assistantTurnId,
    signal: control.signal,
    initialAttempt: initialAttempt(run.events, connection),
    inactivityTimeoutMs: context.inactivityTimeoutMs,
    onReplayExpired: () => {
      clearActiveRunMarker(context.conversationStorageKey);
      store.clear();
      context.onReplayExpired(run.conversationId);
    },
    onServerTerminal: () => {
      clearActiveRunMarker(context.conversationStorageKey);
    },
  });
  finalizeSubscription(context, store, control.signal);
};

const initialAttempt = (
  events: InitialStreamAttempt["events"],
  controller: AbortController,
): InitialStreamAttempt => ({ events, controller });

const forwardAbort = (outer: AbortSignal, inner: AbortController): (() => void) => {
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

const isAbortApiError = (error: unknown): boolean =>
  error instanceof SideChatApiError && error.code === "aborted";

const isReplayExpiredError = (error: unknown): boolean =>
  error instanceof SideChatApiError && error.code === "replay_expired";

/**
 * Tail one turn to its terminal (the resume path), with transport recovery.
 *
 * On resume the store is moved to `reconnecting` first so the UI reflects the
 * retry. Recovery resumes from the store's cursor, so no offset is threaded
 * through. When the stream ends the marker is cleared if the run reached a
 * terminal status.
 */
export const driveSubscription = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  target: SubscribeTarget,
  signal: AbortSignal,
): Promise<void> => {
  if (target.resuming) store.dispatch(target.requestId, { type: "reconnect-started" });

  await consumeTurnStreamWithRecovery({
    client: context.client,
    store,
    hostBridge: context.hostBridge,
    requestId: target.requestId,
    assistantTurnId: target.assistantTurnId,
    signal,
    inactivityTimeoutMs: context.inactivityTimeoutMs,
    onReplayExpired: () => {
      clearActiveRunMarker(context.conversationStorageKey);
      store.clear();
      context.onReplayExpired(target.conversationId);
    },
    onServerTerminal: () => {
      clearActiveRunMarker(context.conversationStorageKey);
    },
  });

  finalizeSubscription(context, store, signal);
};

const finalizeSubscription = (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  signal: AbortSignal,
): void => {
  if (signal.aborted) return;
  const run = store.getSnapshot();
  if (run && isTerminalRun(run)) clearActiveRunMarker(context.conversationStorageKey);
};

const isTerminalRun = (run: WidgetRunState): boolean =>
  run.status === WIDGET_RUN_STATUSES.COMPLETED ||
  run.status === WIDGET_RUN_STATUSES.FAILED ||
  run.status === WIDGET_RUN_STATUSES.CANCELLED;

/**
 * Cancel the live turn through the server, then render its terminal state.
 *
 * Cancel is a durable intent, not just a fetch abort: the server CAS-acks and
 * the owning instance interrupts generation. After the ack the run is marked
 * cancelled locally so the terminal state shows even before the stream's own
 * terminal arrives.
 */
export const cancelRun = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
): Promise<void> => {
  const run = store.getSnapshot();
  if (!run?.assistantTurnId) return;

  try {
    await context.client.cancelTurn(run.assistantTurnId, {});
    store.dispatch(run.requestId, { type: "terminal", status: WIDGET_RUN_STATUSES.CANCELLED });
    clearActiveRunMarker(context.conversationStorageKey);
  } catch (error) {
    if (error instanceof SideChatApiError && error.code === "aborted") return;
    store.dispatch(run.requestId, { type: "stream-failed", message: runErrorMessage(error) });
  }
};
