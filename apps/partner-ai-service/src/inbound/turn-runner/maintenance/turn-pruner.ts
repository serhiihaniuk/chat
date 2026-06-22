import type { ClockPort } from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import { Effect, Exit, Schedule, Scope } from "effect";

/**
 * Per-instance background pruner for `turn_events` retention.
 *
 * Every instance runs one pruner. On a fixed cadence it asks the repository to
 * delete the durable event log of terminal turns whose retention window has
 * elapsed (`completed_at` older than `now - retention`), keeping the consolidated
 * turn record and assistant message. The delete is batched and idempotent across
 * instances — a turn already pruned is simply not selected again — so running the
 * same sweep on every replica is safe. A pruned turn still resolves and falls back
 * to conversation history on resume (the route returns `replay_expired`).
 */
export type TurnPruner = {
  /** Run one sweep now and return how many turns were pruned (tests/diagnostics). */
  readonly sweepOnce: () => Promise<number>;
  /** Interrupt the periodic sweep and release the pruner scope (shutdown). */
  readonly shutdown: () => Promise<void>;
};

export type TurnPrunerDependencies = {
  readonly repositories: SidechatRepositories;
  readonly clock: ClockPort;
  /** How long a terminal turn keeps its event rows after `completed_at`. */
  readonly retentionMs: number;
  /** Sweep cadence; how often this instance prunes long-terminal turns. */
  readonly prunerIntervalMs: number;
  /** Upper bound on turns pruned per pass so a backlog drains over several sweeps. */
  readonly batchLimit: number;
};

/**
 * Build the pruner on a long-lived scope and start its periodic sweep.
 *
 * The scope and sweep fiber are created eagerly because the pruner outlives any one
 * request; closing the scope on shutdown interrupts the sweep. A sweep error is
 * swallowed so one failed pass never faults the recurring fiber — the next pass
 * retries, and the durable log is unchanged (delete is all-or-nothing per pass).
 */
export const createTurnPruner = (
  dependencies: TurnPrunerDependencies,
): TurnPruner => {
  const scope = Effect.runSync(Scope.make());
  startPeriodicSweep(scope, dependencies);

  return {
    sweepOnce: () => Effect.runPromise(sweepPrunableTurns(dependencies)),
    shutdown: () =>
      Effect.runPromise(Scope.close(scope, Exit.succeed(undefined))),
  };
};

/**
 * Fork the recurring sweep into the pruner scope.
 *
 * `Schedule.spaced` waits the interval between passes; the first pass also waits,
 * so a fresh instance does not sweep before it has served traffic. The sweep is
 * wrapped so a transient failure is ignored rather than ending the schedule.
 */
const startPeriodicSweep = (
  scope: Scope.Scope,
  dependencies: TurnPrunerDependencies,
): void => {
  const recurring = sweepPrunableTurns(dependencies).pipe(
    Effect.catchCause(() => Effect.void),
    Effect.schedule(Schedule.spaced(dependencies.prunerIntervalMs)),
  );
  Effect.runSync(Effect.forkIn(recurring, scope));
};

/**
 * Prune every long-terminal turn's event log once and report how many turns.
 *
 * The cutoff is derived from the injected clock, not `now()`, so tests can control
 * the retention boundary deterministically. The delete keeps the turn record and
 * assistant message; only the now-redundant event rows go.
 */
const sweepPrunableTurns = (
  dependencies: TurnPrunerDependencies,
): Effect.Effect<number> =>
  Effect.gen(function* () {
    const completedBefore = retentionCutoff(dependencies);
    const pruned = yield* Effect.promise(() =>
      dependencies.repositories.pruneTurnEventsBefore({
        completedBefore,
        limit: dependencies.batchLimit,
      }),
    );
    return pruned.prunedTurns;
  });

const retentionCutoff = (dependencies: TurnPrunerDependencies): string =>
  new Date(
    new Date(dependencies.clock.now()).getTime() - dependencies.retentionMs,
  ).toISOString();
