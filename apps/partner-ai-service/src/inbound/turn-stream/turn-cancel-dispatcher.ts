import type { TurnCancelNotificationSource } from "@side-chat/db";
import { Effect, Exit, Scope, Stream } from "effect";

import type { TurnRunner } from "#inbound/turn-runner/turn-runner";

/**
 * Per-instance reaction to durable cancel intent.
 *
 * A cancel can be requested from any instance, but only the instance that owns
 * the live generation fiber can interrupt it. This dispatcher listens on the db
 * cancel notification source and, for each signal, asks the runner to interrupt
 * the named turn. `interruptTurn` is `FiberMap.remove`, which is a no-op when this
 * instance does not own the turn — so non-owning instances react harmlessly and
 * the owning instance's fiber is interrupted, driving its abnormal finalize to a
 * `user_aborted` terminal. A dead owner leaves only the durable intent, which the
 * reaper later terminalizes.
 */
export type TurnCancelDispatcher = {
  /** Interrupt the listener and release the dispatcher scope (shutdown). */
  readonly shutdown: () => Promise<void>;
};

export type TurnCancelDispatcherDependencies = {
  readonly runner: TurnRunner;
  readonly notificationSource: TurnCancelNotificationSource;
};

/**
 * Build the cancel dispatcher on a long-lived scope and start its single listener.
 *
 * The scope and listener fiber are created eagerly because the dispatcher
 * outlives any one request: the dedicated cancel `LISTEN` connection lives in this
 * scope and is torn down on shutdown.
 */
export const createTurnCancelDispatcher = (
  dependencies: TurnCancelDispatcherDependencies,
): TurnCancelDispatcher => {
  const scope = Effect.runSync(Scope.make());
  startCancelListener(scope, dependencies);

  const shutdown = (): Promise<void> =>
    Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));

  return { shutdown };
};

/**
 * Fork the one listener that turns cancel signals into fiber interruptions.
 *
 * The drain runs in the dispatcher scope, so closing the scope interrupts it and
 * the db notification source tears its dedicated LISTEN connection down. An
 * interrupt failure is swallowed so a transient runner error never faults the
 * shared listener fiber; the durable intent still drives the reaper.
 */
const startCancelListener = (
  scope: Scope.Scope,
  dependencies: TurnCancelDispatcherDependencies,
): void => {
  const drain = Stream.runForEach(dependencies.notificationSource.notifications, (notification) =>
    interruptOwnedTurn(dependencies.runner, notification.assistantTurnId),
  );
  Effect.runSync(Effect.forkIn(drain, scope));
};

const interruptOwnedTurn = (runner: TurnRunner, assistantTurnId: string): Effect.Effect<void> =>
  Effect.promise(() => runner.interruptTurn(assistantTurnId)).pipe(
    Effect.catchCause(() => Effect.void),
  );
