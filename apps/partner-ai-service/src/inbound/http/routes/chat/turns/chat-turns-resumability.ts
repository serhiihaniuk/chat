import { PROTOCOL_ERROR_CODES } from "@side-chat/chat-protocol";
import type { AssistantTurnRecord, SidechatRepositories } from "@side-chat/db";
import type {
  AuthContext,
  ObservabilitySinkPort,
  StreamChatPorts,
} from "@side-chat/partner-ai-core";

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
export const isTerminalTurn = (turn: AssistantTurnRecord): boolean =>
  turn.status !== "running";

/**
 * Detect a pruned-log gap that makes replay impossible (resumable-streaming plan).
 *
 * A turn can only `replay_expired` once it is terminal: a running turn always has
 * its log and the tail will deliver new events. For a terminal turn there is a gap
 * when the smallest retained sequence is past `after + 1` — the next event the
 * subscriber needs was pruned (or the whole log is gone) — so it must fall back to
 * conversation history rather than open a stream that can never replay.
 */
export const isReplayExpired = async (
  dependencies: ChatTurnResumabilityDependencies,
  authContext: AuthContext,
  turn: AssistantTurnRecord,
  after: number,
): Promise<boolean> => {
  if (!isTerminalTurn(turn)) return false;
  const minSequence = await dependencies.repositories.minTurnEventSequence({
    workspaceId: authContext.workspaceId,
    assistantTurnId: turn.assistantTurnId,
  });
  // No rows left at all, or the smallest retained one is past the next needed
  // sequence: either way the requested replay offset can no longer be served.
  return minSequence === undefined || minSequence > after + 1;
};

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
