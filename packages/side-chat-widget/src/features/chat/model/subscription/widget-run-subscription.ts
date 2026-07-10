import {
  ACTIVITY_STATUSES,
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  createCommandResult,
  createFailedResult,
  isHostCommandActivityEvent,
  toHostCommand,
  type HostBridge,
  type HostCommandActivityEvent,
} from "@side-chat/host-bridge";

import { toErrorMessage, toJsonObject } from "#entities/chat";
import { isAbortApiError, SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { toHostCommandResultJson } from "../run/widget-run-projection.js";
import type { WidgetRunStore } from "../run/widget-run-store.js";

type HostBridgeRef = Pick<HostBridge, "dispatchCommand"> | undefined;

export type RunSubscriptionInput = {
  readonly client: SideChatApiClient;
  readonly store: WidgetRunStore;
  readonly hostBridge: HostBridgeRef;
  readonly requestId: string;
  readonly assistantTurnId: string;
  /**
   * Pre-acquired event stream (the `createRun` POST body). When present, the
   * subscription consumes it directly; when absent, it opens the resume GET
   * from `after`.
   */
  readonly events?: AsyncIterable<SidechatStreamEvent> | undefined;
  /** Resume cursor for the subscribe path; ignored when `events` is provided. */
  readonly after?: number | undefined;
  readonly signal: AbortSignal;
  /** Fires per received event (the recovery watchdog's liveness signal). */
  readonly onEvent?: (() => void) | undefined;
};

/**
 * How one subscription attempt ended, for the recovery loop to act on.
 *
 * `ended` means the stream closed after its terminal event (the reader throws
 * `missing_terminal` otherwise, which arrives as `error`). `aborted` reflects the
 * attempt's own signal — the caller decides whether that was user intent (outer
 * abort) or its watchdog cutting a wedged connection. `error` carries the raw
 * failure for classification; nothing here decides retryability.
 */
export type SubscriptionAttemptOutcome =
  | { readonly kind: "ended" }
  | { readonly kind: "aborted" }
  | { readonly kind: "replay-expired" }
  | { readonly kind: "error"; readonly error: unknown };

/**
 * Apply one subscription attempt to the run store.
 *
 * Events come either from the initial POST response or from a resume request.
 * Sequence checks make replay safe. Host commands are dispatched once, then
 * their result is written before later events continue.
 *
 * This function reports failures to transport recovery. It does not decide
 * whether to retry, poll, or fail the run.
 */
export const runSubscription = async (
  input: RunSubscriptionInput,
): Promise<SubscriptionAttemptOutcome> => {
  try {
    const events = input.events ?? (await openResumeStream(input));
    await consumeEvents(input, events);
  } catch (error) {
    if (input.signal.aborted || isAbortApiError(error)) return { kind: "aborted" };
    if (error instanceof SideChatApiError && error.code === "replay_expired") {
      return { kind: "replay-expired" };
    }
    return { kind: "error", error };
  }
  return input.signal.aborted ? { kind: "aborted" } : { kind: "ended" };
};

const openResumeStream = async (
  input: RunSubscriptionInput,
): Promise<AsyncIterable<SidechatStreamEvent>> => {
  const subscription = await input.client.subscribeTurn(input.assistantTurnId, {
    after: input.after,
    signal: input.signal,
  });
  return subscription.events;
};

const consumeEvents = async (
  input: RunSubscriptionInput,
  events: AsyncIterable<SidechatStreamEvent>,
): Promise<void> => {
  for await (const event of events) {
    if (input.signal.aborted) return;
    input.onEvent?.();
    input.store.dispatch(input.requestId, { type: "event", event });
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
  // A replayed, already-resolved host command must never re-execute. A cold
  // resume after reload replays from `after=-1` with a fresh dedupe set, so the
  // dedupe list alone cannot catch it; a non-running status or a persisted result
  // means the command was already handled. The live path emits it running with no
  // result, so the genuine first call still dispatches.
  if (event.status !== ACTIVITY_STATUSES.RUNNING) return;
  if (event.details.hostCommand.result !== undefined) return;

  const current = input.store.getSnapshot();
  if (current?.dispatchedHostCommandIds.includes(event.activityId)) return;
  input.store.dispatch(input.requestId, {
    type: "host-command-dispatched",
    activityId: event.activityId,
  });

  const result = await dispatchHostCommand(input.hostBridge, event);
  input.store.dispatch(input.requestId, { type: "host-command-result", event, result });
  await submitHostCommandResult(input, event.activityId, result);
};

/**
 * Post the dispatched result back so the server's awaiting tool call resolves.
 *
 * Connection-bound round-trip: the server emitted this host_command while we are
 * streaming, so it is awaiting our result. Best-effort — a failed post (the turn
 * already timed out, or the connection dropped) leaves the server to time out and
 * the model to adapt; the local timeline already shows the result.
 */
const submitHostCommandResult = async (
  input: RunSubscriptionInput,
  commandId: string,
  result: Parameters<typeof toHostCommandResultJson>[0],
): Promise<void> => {
  if (!input.client.submitHostCommandResult) return;
  try {
    await input.client.submitHostCommandResult(
      {
        assistantTurnId: input.assistantTurnId,
        commandId,
        result: toHostCommandResultJson(result),
      },
      { signal: input.signal },
    );
  } catch {
    // Swallowed by design: see the doc comment above.
  }
};

const dispatchHostCommand = async (hostBridge: HostBridgeRef, event: HostCommandActivityEvent) => {
  const command = toHostCommand(event);
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
