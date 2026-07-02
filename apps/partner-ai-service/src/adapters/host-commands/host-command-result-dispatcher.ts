import type {
  HostCommandResultNotification,
  HostCommandResultNotificationSource,
} from "@side-chat/db";
import { Effect, Exit, Scope, Stream } from "effect";

import type {
  HostCommandResultStore,
  ServiceHostCommandResolver,
} from "./service-host-command-resolver.js";

/**
 * Per-instance reaction to a durably persisted host-command result.
 *
 * A browser can POST a result to any instance, but only the instance whose tool
 * loop is paused on the command can settle it. This dispatcher listens on the db
 * result notification source and, for each signal, reads the persisted result
 * and offers it to the local resolver. `resolveResult` is a no-op when nothing
 * is pending here — so non-owning instances react harmlessly, and the owning
 * instance's tool loop resumes promptly instead of waiting for its next result
 * poll. A lost signal costs one poll interval, never correctness (ADR 0009).
 */
export type HostCommandResultDispatcher = {
  /** Interrupt the listener and release the dispatcher scope (shutdown). */
  readonly shutdown: () => Promise<void>;
};

export type HostCommandResultDispatcherDependencies = {
  readonly resolver: ServiceHostCommandResolver;
  readonly repositories: HostCommandResultStore;
  readonly workspaceId: string;
  readonly notificationSource: HostCommandResultNotificationSource;
};

/**
 * Build the result dispatcher on a long-lived scope and start its single listener.
 *
 * The scope and listener fiber are created eagerly because the dispatcher
 * outlives any one request: the dedicated result `LISTEN` connection lives in
 * this scope and is torn down on shutdown.
 */
export const createHostCommandResultDispatcher = (
  dependencies: HostCommandResultDispatcherDependencies,
): HostCommandResultDispatcher => {
  const scope = Effect.runSync(Scope.make());
  startResultListener(scope, dependencies);

  const shutdown = (): Promise<void> =>
    Effect.runPromise(Scope.close(scope, Exit.succeed(undefined)));

  return { shutdown };
};

/**
 * Fork the one listener that turns result signals into local settlements.
 *
 * The drain runs in the dispatcher scope, so closing the scope interrupts it and
 * the db notification source tears its dedicated LISTEN connection down. A
 * failed settle read is swallowed so a transient repository error never faults
 * the shared listener fiber; the owner's result poll still settles the command.
 */
const startResultListener = (
  scope: Scope.Scope,
  dependencies: HostCommandResultDispatcherDependencies,
): void => {
  const drain = Stream.runForEach(dependencies.notificationSource.notifications, (notification) =>
    settlePendingCommand(dependencies, notification),
  );
  Effect.runSync(Effect.forkIn(drain, scope));
};

const settlePendingCommand = (
  dependencies: HostCommandResultDispatcherDependencies,
  notification: HostCommandResultNotification,
): Effect.Effect<void> =>
  Effect.promise(async () => {
    const record = await dependencies.repositories.findHostCommandResult({
      workspaceId: dependencies.workspaceId,
      assistantTurnId: notification.assistantTurnId,
      commandId: notification.commandId,
    });
    if (record?.resolvedAt === undefined) return;
    dependencies.resolver.resolveResult({
      assistantTurnId: notification.assistantTurnId,
      commandId: notification.commandId,
      result: record.resultRedactedJson ?? {},
    });
  }).pipe(Effect.catchCause(() => Effect.void));
