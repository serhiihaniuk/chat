import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import type { WidgetMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { runErrorMessage } from "../run/widget-run-reducer.js";
import { WIDGET_RUN_STATUSES, type WidgetRunState } from "../run/widget-run-state.js";
import type { WidgetRunStore } from "../run/widget-run-store.js";
import { clearActiveRunMarker, writeActiveRunMarker } from "../reconnect/widget-run-marker.js";
import { runSubscription } from "./widget-run-subscription.js";

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
  readonly refreshHistory: (conversationId: string | undefined) => void;
};

export type SubscribeTarget = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly conversationId: string | undefined;
  readonly after: number;
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
 * a healthy stream. A different turn id aborts the old one first.
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

/**
 * Create the run, seed the store and marker, then open the first subscription.
 *
 * Create failures (no `sidechat.started` was ever seen) fail the run as a
 * request-level error; the optimistic bubbles stay so the user sees the prompt
 * with an error rather than a vanished message.
 */
export const beginRun = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  subscribe: (target: SubscribeTarget) => void,
  startInput: StartRunInput,
): Promise<void> => {
  const { requestId } = startInput.request;
  store.start({
    requestId,
    localUserMessageId: startInput.localUserMessageId,
    localAssistantMessageId: startInput.localAssistantMessageId,
    messages: startInput.messages,
  });

  try {
    const created = await context.client.createRun(startInput.request, {});
    // Record the canonical turn id so cancel/reconnect can act before any event.
    store.dispatch(requestId, { type: "identified", assistantTurnId: created.assistantTurnId });
    writeActiveRunMarker(context.conversationStorageKey, {
      requestId: created.requestId,
      assistantTurnId: created.assistantTurnId,
      conversationId: created.conversationId,
      lastSeenSequence: -1,
    });
    subscribe({
      requestId,
      assistantTurnId: created.assistantTurnId,
      conversationId: created.conversationId,
      after: -1,
      resuming: false,
    });
  } catch (error) {
    store.dispatch(requestId, { type: "stream-failed", message: runErrorMessage(error) });
  }
};

/**
 * Run one subscription end to end, keeping the marker's offset current.
 *
 * On resume the store is moved to `reconnecting` first so the UI reflects the
 * retry. When the stream ends (or fails) the marker is cleared if the run
 * reached a terminal status.
 */
export const driveSubscription = async (
  context: RunLifecycleContext,
  store: WidgetRunStore,
  target: SubscribeTarget,
  signal: AbortSignal,
): Promise<void> => {
  if (target.resuming) store.dispatch(target.requestId, { type: "reconnect-started" });

  await runSubscription({
    client: context.client,
    store,
    hostBridge: context.hostBridge,
    requestId: target.requestId,
    assistantTurnId: target.assistantTurnId,
    after: target.after,
    signal,
    onSequence: (sequence) =>
      writeActiveRunMarker(context.conversationStorageKey, {
        requestId: target.requestId,
        assistantTurnId: target.assistantTurnId,
        conversationId: target.conversationId,
        lastSeenSequence: sequence,
      }),
    onReplayExpired: () => {
      clearActiveRunMarker(context.conversationStorageKey);
      store.clear();
      context.onReplayExpired(target.conversationId);
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
