import { PROTOCOL_ERROR_CODES } from "@side-chat/chat-protocol";
import type { AssistantTurnRecord, SidechatRepositories } from "@side-chat/db";
import type { ObservabilitySinkPort, StreamChatPorts } from "@side-chat/partner-ai-core";

import { emitResumableObservation } from "#inbound/turn-stream/turn-observability";

/**
 * Resumable-streaming concerns for the turn-stream route: replay-expiry detection
 * and the transport lifecycle observations (replay served/expired, run finished,
 * cancel). Kept beside the route so the handler stays a thin spine and these
 * decisions read top-down on their own.
 */
export type ChatTurnResumabilityDependencies = {
  readonly repositories: SidechatRepositories;
  readonly ports: StreamChatPorts;
  readonly observability?: ObservabilitySinkPort | undefined;
};

/** Assistant-turn statuses that are no longer running (the durable run has ended). */
export const isTerminalTurn = (turn: AssistantTurnRecord): boolean => turn.status !== "running";

/**
 * Record a replay outcome (served vs expired) with its offset and turn status.
 *
 * Reuses the resumable observation pattern so operators can watch replay hit rate
 * and how often pruning forces a history fallback. Best-effort: the recorder
 * swallows sink failures, so it never affects the response.
 */
export const recordReplayOutcome = (
  dependencies: ChatTurnResumabilityDependencies,
  turn: AssistantTurnRecord,
  lifecycleState: "replay_served" | "replay_expired",
  after: number,
): void =>
  emitResumableObservation({
    sink: dependencies.observability,
    lifecycleState,
    assistantTurnId: turn.assistantTurnId,
    requestId: turn.requestId,
    now: dependencies.ports.clock.now(),
    attributes: { after, turnStatus: turn.status },
  });

/**
 * Record run duration when a finished turn is (re)attached over the transport.
 *
 * The duration is `startedAt -> completedAt` from the durable turn record, so the
 * resumable transport surfaces how long the run took independently of the core
 * terminal observation. Skipped when `completedAt` is somehow absent.
 */
export const recordRunFinished = (
  dependencies: ChatTurnResumabilityDependencies,
  turn: AssistantTurnRecord,
): void => {
  if (!turn.completedAt) return;
  emitResumableObservation({
    sink: dependencies.observability,
    lifecycleState: "run_finished",
    assistantTurnId: turn.assistantTurnId,
    requestId: turn.requestId,
    startedAt: turn.startedAt,
    now: turn.completedAt,
    // A completed turn has no errorCode; a failed/aborted one carries its terminal
    // code. The field is undefined-capable, so passing it through is honest either way.
    errorCode: turn.errorCode,
    attributes: { turnStatus: turn.status },
  });
};

/**
 * Record a cancel-route invocation with its outcome.
 *
 * `cancelRequested` is false for a finished/unknown turn (a durable no-op), so the
 * record lets operators tell a real cancel from a no-op ack.
 */
export const recordTurnCancelled = (
  dependencies: ChatTurnResumabilityDependencies,
  assistantTurnId: string,
  cancelRequested: boolean,
): void =>
  emitResumableObservation({
    sink: dependencies.observability,
    lifecycleState: "turn_cancelled",
    assistantTurnId,
    requestId: assistantTurnId,
    now: dependencies.ports.clock.now(),
    errorCode: PROTOCOL_ERROR_CODES.ABORTED,
    attributes: { reason: "requested", cancelRequested },
  });
