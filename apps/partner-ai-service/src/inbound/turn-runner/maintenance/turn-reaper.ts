import type { ClockPort, ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import type { ReapedTurn, SidechatRepositories } from "@side-chat/db";
import { Effect, Exit, Schedule, Scope } from "effect";

import { recordResumableObservation } from "#inbound/turn-stream/turn-observability";

/**
 * Finish turns whose server owner died (ADR 0008).
 *
 * A hard crash can leave a turn marked `running` forever. Each service instance
 * periodically asks the repository to finish turns with an expired lease or a
 * missing lease past the startup grace period. The update also increments the
 * lease epoch, so a crashed owner that wakes up cannot write again.
 *
 * The crashed instance's in-memory stream is gone, so the reaper emits no
 * replacement stream event. The durable status update clears activity dots, and
 * clients read the final result from history.
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
  readonly reaperIntervalMs: number;
  readonly batchLimit: number;
  /** Grace for running turns that never acquired a lease (crash before acquire). */
  readonly nullLeaseGraceMs: number;
  /** Optional telemetry sink; each reap is recorded with its honest reason. */
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
 * `Schedule.spaced` waits the interval between passes; the first pass also
 * waits, so a fresh instance does not immediately reap turns whose owners are
 * still inside their first lease window after a rolling restart.
 */
const startPeriodicSweep = (scope: Scope.Scope, dependencies: TurnReaperDependencies): void => {
  const recurring = sweepExpiredTurns(dependencies).pipe(
    Effect.catchCause(() => Effect.void),
    Effect.schedule(Schedule.spaced(dependencies.reaperIntervalMs)),
  );
  Effect.runSync(Effect.forkIn(recurring, scope));
};

/** Reap every dead-owner turn once and record each for operators. */
const sweepExpiredTurns = (dependencies: TurnReaperDependencies): Effect.Effect<number> =>
  Effect.gen(function* () {
    const now = dependencies.clock.now();
    const reaped = yield* Effect.promise(() =>
      dependencies.repositories.reapExpiredTurns({
        now,
        nullLeaseGraceMs: dependencies.nullLeaseGraceMs,
        limit: dependencies.batchLimit,
      }),
    );
    for (const turn of reaped) {
      yield* recordReapObservation(dependencies, turn, now);
    }
    return reaped.length;
  });

/**
 * Record one reaped turn so operators see dead-owner recovery, with the reason
 * carrying the honest cancel-vs-timeout split. The turn's own `requestId` is not
 * in the reap result, so the turn id doubles as the correlation key.
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
    errorCode: turn.cancelRequested ? "aborted" : "timeout",
    attributes: {
      reapedCount: 1,
      reason: turn.cancelRequested ? "cancelled" : "lease_expired",
    },
  });
