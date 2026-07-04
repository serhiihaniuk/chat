import {
  createPostgresHostCommandResultNotificationSource,
  createPostgresTurnActivityNotificationSource,
  createPostgresTurnCancelNotificationSource,
  NOOP_HOST_COMMAND_RESULT_NOTIFICATION_SOURCE,
  NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE,
  NOOP_TURN_CANCEL_NOTIFICATION_SOURCE,
  type HostCommandResultNotificationSource,
  type SidechatRepositories,
  type TurnActivityNotificationSource,
  type TurnCancelNotificationSource,
} from "@side-chat/db";
import type { DiagnosticLogger } from "@side-chat/shared";

import type { PersistenceConfig } from "../service-composition-types.js";

/**
 * Build the per-instance cancel notification source for the cancel dispatcher.
 *
 * Postgres persistence gets its own dedicated cancel `LISTEN` connection so a
 * cancel requested on another instance can interrupt the owning fiber. Memory
 * persistence has no cross-process wake signal, so it uses the no-op source; a
 * memory-backed cancel still interrupts in-process through the cancel route's
 * direct runner call.
 */
export const createCancelNotificationSource = (
  persistence: PersistenceConfig,
  repositories: SidechatRepositories,
  logger?: DiagnosticLogger,
): TurnCancelNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresTurnCancelNotificationSource(
        persistence.databaseUrl,
        logger,
        // On each (re)connect, re-surface running turns with durable cancel intent
        // so a cancel that fired while the listener was down still interrupts.
        async () =>
          (await repositories.listRunningCancelRequestedTurns()).map(
            (turn) => turn.assistantTurnId,
          ),
      )
    : NOOP_TURN_CANCEL_NOTIFICATION_SOURCE;

/**
 * Build the per-instance turn-activity notification source for the dispatcher.
 *
 * Postgres persistence gets its own dedicated activity `LISTEN` connection. Memory
 * persistence has no cross-process wake signal, so it uses the no-op source: the
 * activity stream still serves its snapshot on connect, it just receives no live
 * transitions (mirrors the turn-event memory source).
 */
export const createActivityNotificationSource = (
  persistence: PersistenceConfig,
  logger?: DiagnosticLogger,
): TurnActivityNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresTurnActivityNotificationSource(persistence.databaseUrl, logger)
    : NOOP_TURN_ACTIVITY_NOTIFICATION_SOURCE;

/**
 * Build the per-instance host-command result notification source.
 *
 * Postgres persistence gets its own dedicated result `LISTEN` connection so a
 * result POSTed to another instance settles the owner's paused tool loop
 * promptly. Memory persistence has no cross-process wake signal, so it uses the
 * no-op source: the route's direct resolver call settles in-process, and the
 * resolver's result poll covers a shared-store multi-composition setup.
 */
export const createHostCommandResultNotificationSource = (
  persistence: PersistenceConfig,
  logger?: DiagnosticLogger,
): HostCommandResultNotificationSource =>
  persistence.kind === "postgres"
    ? createPostgresHostCommandResultNotificationSource(persistence.databaseUrl, logger)
    : NOOP_HOST_COMMAND_RESULT_NOTIFICATION_SOURCE;
