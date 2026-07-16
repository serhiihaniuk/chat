import type { WorkflowAgent, WorkflowAgentStreamResult } from "@ai-sdk/workflow";

import type { ChatTurnJournalPart } from "../../journal/chat-turn-journal.js";
import type { ChatTurnWorkflowInput } from "../../input/chat-turn-input.js";
import { toChatTurnModelMessages } from "../../agent/chat-turn-agent.js";
import type { createSuspendableTurnTimeout } from "../../timeout/turn-timeout.js";
import {
  didWorkflowAgentFail,
  toCompletedChatTurnOutcome,
} from "../completed-chat-turn-outcome.js";
import {
  ABORT_ERROR_NAME,
  CHAT_TURN_ERROR_CODES,
  CHAT_TURN_OUTCOMES,
  failedChatTurnOutcome,
  shouldDeferChatTurnStreamFailure,
  type ChatTurnTerminalOutcome,
} from "../chat-turn-outcome.js";

type SettledStream =
  | Readonly<{ kind: "completed"; result: WorkflowAgentStreamResult }>
  | Readonly<{ kind: "failed"; error: unknown }>;

/** An aborted stream defers to the cancel or timeout arm that requested it. */
const DEFERRED_OUTCOME: Promise<never> = new Promise(() => {
  // Intentionally never settles.
});

/** Resolve exactly one terminal outcome without depending on abort message text. */
export async function raceChatTurnOutcome(
  agent: WorkflowAgent,
  controller: AbortController,
  cancellation: PromiseLike<Readonly<{ reason: string }>>,
  providerTimeout: ReturnType<typeof createSuspendableTurnTimeout>,
  writable: WritableStream<ChatTurnJournalPart>,
  input: ChatTurnWorkflowInput,
): Promise<ChatTurnTerminalOutcome> {
  const activityStartedAt = Date.now();
  const streamSettled = agent
    .stream({
      messages: toChatTurnModelMessages(input.messages),
      writable,
      abortSignal: controller.signal,
    })
    .then(
      (result): SettledStream => ({ kind: "completed", result }),
      (error): SettledStream => ({ kind: "failed", error }),
    );

  const streamOutcome = streamSettled.then((settled) =>
    resolveSettledStream(
      settled,
      input,
      Math.max(0, Date.now() - activityStartedAt),
      controller.signal.aborted,
    ),
  );

  const cancelOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    const payload = await cancellation;
    controller.abort(new DOMException(payload.reason, ABORT_ERROR_NAME));
    await streamSettled;
    return { status: CHAT_TURN_OUTCOMES.CANCELLED, reason: payload.reason };
  };

  const timeoutOutcome = async (): Promise<ChatTurnTerminalOutcome> => {
    await providerTimeout.waitUntilElapsed();
    controller.abort(new DOMException(CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT, ABORT_ERROR_NAME));
    await streamSettled;
    return {
      status: CHAT_TURN_OUTCOMES.FAILED,
      code: CHAT_TURN_ERROR_CODES.PROVIDER_TIMEOUT,
    };
  };

  return await Promise.race([streamOutcome, cancelOutcome(), timeoutOutcome()]);
}

function resolveSettledStream(
  settled: SettledStream,
  input: ChatTurnWorkflowInput,
  activityDurationMs: number,
  controllerAbortRequested: boolean,
): ChatTurnTerminalOutcome | Promise<never> {
  if (settled.kind === "completed") {
    if (didWorkflowAgentFail(settled.result)) return failedChatTurnOutcome();
    return toCompletedChatTurnOutcome(
      input.turnId,
      input.maxSteps,
      activityDurationMs,
      settled.result,
    );
  }
  if (shouldDeferChatTurnStreamFailure(settled.error, controllerAbortRequested)) {
    return DEFERRED_OUTCOME;
  }
  return failedChatTurnOutcome();
}
