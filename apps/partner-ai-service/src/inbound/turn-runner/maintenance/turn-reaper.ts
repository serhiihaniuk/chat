import type { ClockPort, ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import type { ReapedTurn, SidechatRepositories } from "@side-chat/db";
import { Effect, Exit, Schedule, Scope } from "effect";

import { recordResumableObservation } from "#inbound/turn-stream/turn-observability";

/**
 * Per-instance background terminalizer for dead-owner recovery (ADR 0008).
 *
 * A clean shutdown finalizes every turn through `onExit`; a hard crash (OOM,
 * `kill -9`) cannot, leaving its turns `running` forever — a permanent
 * "generating" dot, a ghost active turn, and a poisoned `requestId`. Every
 * instance runs one reaper: on a fixed cadence it asks the repository to
 * compare-and-set every dead-owner running turn (expired lease, or a NULL lease
 * past the started-at grace) into an honest terminal status, bumping the epoch
 * so a zombie owner waking up is fenced. Concurrent sweeps are safe — the
 * repository claims disjoint rows — so no leader election is needed.
 *
 * There is no event to append: the crashed owner's in-memory stream buffer died
 * with it, and the repository's status CAS notifies the activity channel in the
 * same transaction, so other tabs' indicators clear live. Clients converge on
 * the durable status via history.
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
