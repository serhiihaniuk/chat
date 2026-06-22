import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "@side-chat/chat-protocol";
import { createCommandResult, createFailedResult, type HostBridge } from "@side-chat/host-bridge";

import { toErrorMessage, toJsonObject } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { runErrorMessage } from "../run/widget-run-reducer.js";
import { isHostCommandActivityEvent, toRunHostCommand } from "../run/widget-run-projection.js";
import type { WidgetRunStore } from "../run/widget-run-store.js";

type HostBridgeRef = Pick<HostBridge, "dispatchCommand"> | undefined;

export type RunSubscriptionInput = {
  readonly client: SideChatApiClient;
  readonly store: WidgetRunStore;
  readonly hostBridge: HostBridgeRef;
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly after: number;
  readonly signal: AbortSignal;
  /** Persist the latest applied sequence so a later reconnect resumes correctly. */
  readonly onSequence: (sequence: number) => void;
  /** Called when the durable log is gone, so the caller can fall back to history. */
  readonly onReplayExpired: () => void;
};

/**
 * Drive one subscription: open the turn stream and fold events into the store.
 *
 * Idempotent by sequence (the reducer drops already-applied events), so a
 * reconnect after `after = lastSeenSequence` never double-applies. Host commands
 * are dispatched once and their result folded back before later events advance
 * the turn. A `replay_expired` open is reported to the caller; an abort is
 * swallowed; any other transport error fails the run for a later reconnect.
 */
export const runSubscription = async (input: RunSubscriptionInput): Promise<void> => {
  try {
    const subscription = await input.client.subscribeTurn(input.assistantTurnId, {
      after: input.after,
      signal: input.signal,
    });
    await consumeEvents(input, subscription.events);
  } catch (error) {
    handleSubscriptionError(input, error);
  }
};

const consumeEvents = async (
  input: RunSubscriptionInput,
  events: AsyncIterable<SidechatStreamEvent>,
): Promise<void> => {
  for await (const event of events) {
    if (input.signal.aborted) return;
    input.store.dispatch(input.requestId, { type: "event", event });
    input.onSequence(event.sequence);
    await maybeDispatchHostCommand(input, event);
  }
};

// Run the host command once per activity id and fold the result back. A failed or
// missing bridge still records a row so the timeline shows the real outcome.
const maybeDispatchHostCommand = async (
  input: RunSubscriptionInput,
  event: SidechatStreamEvent,
): Promise<void> => {
  if (event.type !== SIDECHAT_EVENT_TYPES.ACTIVITY) return;
  if (!isHostCommandActivityEvent(event)) return;

  const current = input.store.getSnapshot();
  if (current?.dispatchedHostCommandIds.includes(event.activityId)) return;
  input.store.dispatch(input.requestId, {
    type: "host-command-dispatched",
    activityId: event.activityId,
  });

  const result = await dispatchHostCommand(input.hostBridge, event);
  input.store.dispatch(input.requestId, { type: "host-command-result", event, result });
};

const dispatchHostCommand = async (
  hostBridge: HostBridgeRef,
  event: Parameters<typeof toRunHostCommand>[0],
) => {
  const command = toRunHostCommand(event);
  if (!hostBridge) {
    return createFailedResult(command, "host_bridge_unavailable");
  }
  try {
    return await hostBridge.dispatchCommand(event);
  } catch (error) {
    return createCommandResult(command, {
      status: "failed",
      resultCode: "host_command_exception",
      data: toJsonObject({ message: toErrorMessage(error) }),
    });
  }
};

const handleSubscriptionError = (input: RunSubscriptionInput, error: unknown): void => {
  if (input.signal.aborted || isAbortError(error)) return;
  if (error instanceof SideChatApiError && error.code === "replay_expired") {
    input.onReplayExpired();
    return;
  }
  input.store.dispatch(input.requestId, {
    type: "stream-failed",
    message: runErrorMessage(error),
  });
};

const isAbortError = (error: unknown): boolean =>
  error instanceof SideChatApiError && error.code === "aborted";
