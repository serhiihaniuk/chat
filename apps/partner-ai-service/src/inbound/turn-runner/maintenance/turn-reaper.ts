import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import type { ClockPort, IdGeneratorPort, ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import { toJsonObject } from "@side-chat/shared";
import type { ReapedTurn, SidechatRepositories } from "@side-chat/db";
import { Effect, Exit, Schedule, Scope } from "effect";
import { recordResumableObservation } from "#inbound/turn-stream/turn-observability";

/**
 * Public message on the synthetic terminal the reaper appends.
 *
 * Mirrors the abnormal finalizer's message so a reconnecting browser renders the
 * same "stopped before it finished" terminal whether the owner finalized the turn
 * or the reaper did. The machine-readable `code` carries the cancel-vs-timeout
 * distinction.
 */
const REAPED_TERMINAL_MESSAGE = "The assistant turn was stopped before it finished.";

/**
 * Per-instance background terminalizer for dead and slow-owner recovery.
 *
 * Every instance runs one reaper. On a fixed cadence it asks the repository to
 * compare-and-set every running turn whose lease expired into a terminal status
 * (fencing its owner by bumping the epoch) and then appends exactly one synthetic
 * terminal per reaped turn. The append is `ON CONFLICT DO NOTHING` on the
 * partial-unique terminal index, so it can never duplicate a real terminal, and
 * the reap CAS plus that index mean two concurrent passes never double-terminalize.
 */
export type TurnReaper = {
  /** Run one sweep now and return how many turns it terminalized (tests/diagnostics). */
  readonly sweepOnce: () => Promise<number>;
  /** Interrupt the periodic sweep and release the reaper scope (shutdown). */
  readonly shutdown: () => Promise<void>;
};

export type TurnReaperDependencies = {
  readonly repositories: SidechatRepositories;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly reaperIntervalMs: number;
  readonly batchLimit: number;
  /** Optional telemetry sink; each reap is recorded with its count and reason. */
  readonly observability?: ObservabilitySinkPort | undefined;
};

/**
 * Build the reaper on a long-lived scope and start its periodic sweep.
 *
 * The scope and sweep fiber are created eagerly because the reaper outlives any
 * one request; closing the scope on shutdown interrupts the sweep. A sweep error
 * is swallowed so one failed pass never faults the recurring fiber — the next
 * pass retries, and the durable lease state is unchanged.
 */
export const createTurnReaper = (dependencies: TurnReaperDependencies): TurnReaper => {
  const scope = Effect.runSync(Scope.make());
  startPeriodicSweep(scope, dependencies);

  return {
    sweepOnce: () => Effect.runPromise(sweepExpiredTurns(dependencies)),
    shutdown: () => Effect.runPromise(Scope.close(scope, Exit.succeed(undefined))),
  };
};

/**
 * Fork the recurring sweep into the reaper scope.
 *
 * `Schedule.spaced` waits the interval between passes; the first pass also waits,
 * so a fresh instance does not immediately reap turns a peer may still own. The
 * sweep is wrapped so a transient failure is logged-as-ignored rather than ending
 * the schedule.
 */
const startPeriodicSweep = (scope: Scope.Scope, dependencies: TurnReaperDependencies): void => {
  const recurring = sweepExpiredTurns(dependencies).pipe(
    Effect.catchCause(() => Effect.void),
    Effect.schedule(Schedule.spaced(dependencies.reaperIntervalMs)),
  );
  Effect.runSync(Effect.forkIn(recurring, scope));
};

/**
 * Extra attempts for a reaped turn's terminal append after a transient failure,
 * before that one turn's failure is isolated from the rest of the batch.
 */
const REAPED_TERMINAL_APPEND_RETRIES = 2;

/**
 * Reap every expired-lease turn once, appending one synthetic terminal each.
 *
 * The CAS already wrote the honest durable status; this only appends the matching
 * browser-facing terminal so a subscriber on any instance sees the turn end. Each
 * turn is finalized independently so one turn's append failure cannot strand the
 * other reaped turns in the same batch.
 */
const sweepExpiredTurns = (dependencies: TurnReaperDependencies): Effect.Effect<number> =>
  Effect.gen(function* () {
    const now = dependencies.clock.now();
    const reaped = yield* Effect.promise(() =>
      dependencies.repositories.reapExpiredTurns({
        now,
        limit: dependencies.batchLimit,
      }),
    );
    for (const turn of reaped) {
      yield* finalizeReapedTurn(dependencies, turn, now);
    }
    return reaped.length;
  });

/**
 * Finalize one reaped turn: append its terminal (retried, isolated), then record it.
 *
 * The reap CAS already terminalized the durable status, so the terminal append is a
 * separate transaction the reaper must survive losing. A transient failure is
 * retried; a persistent one is isolated to this turn — swallowed, not rethrown — so
 * the rest of the batch still closes. The residual (every retry fails) leaves a
 * correct terminal status with no terminal event, which a reconnecting subscriber
 * re-syncs from the durable log. The reap is recorded once either way, because the
 * status was terminalized regardless of the append.
 */
const finalizeReapedTurn = (
  dependencies: TurnReaperDependencies,
  turn: ReapedTurn,
  now: string,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.retry(
      appendReapedTerminal(dependencies, turn, now),
      Schedule.recurs(REAPED_TERMINAL_APPEND_RETRIES),
    ).pipe(Effect.catchCause(() => Effect.void));
    yield* recordReapObservation(dependencies, turn, now);
  });

/**
 * Append one reaped turn's synthetic terminal at `maxSequence + 1`.
 *
 * Uses the failure channel (`tryPromise`) so a transient persistence error is
 * retryable by the caller; the partial-unique terminal index still guarantees this
 * can never duplicate a real terminal that landed first.
 */
const appendReapedTerminal = (
  dependencies: TurnReaperDependencies,
  turn: ReapedTurn,
  now: string,
): Effect.Effect<void, unknown> =>
  Effect.gen(function* () {
    const maxSequence = yield* Effect.tryPromise(() =>
      dependencies.repositories.maxTurnEventSequence({
        workspaceId: turn.workspaceId,
        assistantTurnId: turn.assistantTurnId,
      }),
    );
    const terminal = reapedTerminalEvent(dependencies, turn, (maxSequence ?? -1) + 1, now);
    yield* Effect.tryPromise(() =>
      dependencies.repositories.appendTurnEvent({
        workspaceId: turn.workspaceId,
        assistantTurnId: turn.assistantTurnId,
        sequence: terminal.sequence,
        type: "error",
        payloadJson: toJsonObject(terminal),
        now,
      }),
    );
  });

/**
 * Record one reaped turn so operators see dead/slow-owner recovery.
 *
 * Recorded once per reap (not per append retry) so the count stays one per turn,
 * with the reason carrying the honest cancel-vs-timeout split.
 */
const recordReapObservation = (
  dependencies: TurnReaperDependencies,
  turn: ReapedTurn,
  now: string,
): Effect.Effect<void> =>
  recordResumableObservation({
    sink: dependencies.observability,
    lifecycleState: "turn_reaped",
    assistantTurnId: turn.assistantTurnId,
    requestId: turn.assistantTurnId,
    now,
    errorCode: reapedTerminalCode(turn),
    attributes: {
      reapedCount: 1,
      reason: turn.cancelRequested ? "cancelled" : "lease_expired",
    },
  });

/**
 * Build the synthetic terminal for one reaped turn.
 *
 * The code honors the durable cancel intent the CAS returned: a cancelled turn is
 * `aborted`, otherwise `timeout` — matching the abnormal finalizer's split for an
 * interrupt with and without cancel intent.
 */
const reapedTerminalEvent = (
  dependencies: TurnReaperDependencies,
  turn: ReapedTurn,
  sequence: number,
  now: string,
): SidechatStreamEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: SIDECHAT_EVENT_TYPES.ERROR,
  eventId: dependencies.ids.nextEventId(),
  assistantTurnId: turn.assistantTurnId,
  sequence,
  createdAt: now,
  code: reapedTerminalCode(turn),
  message: REAPED_TERMINAL_MESSAGE,
  retryable: false,
});

const reapedTerminalCode = (turn: ReapedTurn): ProtocolErrorCode =>
  turn.cancelRequested ? PROTOCOL_ERROR_CODES.ABORTED : PROTOCOL_ERROR_CODES.TIMEOUT;
