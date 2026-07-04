import { type Cause, Effect, Queue, type Scope, Stream } from "effect";
import { Client } from "pg";
import type { DiagnosticLogger } from "@side-chat/shared";

import { HOST_COMMAND_RESULT_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseHostCommandResultNotification,
  type HostCommandResultNotification,
  type HostCommandResultNotificationSource,
} from "../../notifications/host-command-result-notifications.js";

/**
 * Build the per-instance Postgres `LISTEN` source for host-command results.
 *
 * `recordHostCommandResult` `pg_notify`s `HOST_COMMAND_RESULT_NOTIFY_CHANNEL` in
 * the same transaction as a resolved result write; this source holds one
 * dedicated connection (not from the query pool, so it survives PgBouncer
 * transaction pooling) and surfaces parsed signals to the service's result
 * dispatcher. It mirrors the cancel notification source so both cross-instance
 * wake signals share one shape.
 *
 * The stream is scoped: subscribing connects and `LISTEN`s, and the scope closing
 * removes the listener and ends the connection. A malformed payload is skipped,
 * not faulted, because the owner's result poll already makes settlement resilient
 * to a dropped signal.
 */
export const createPostgresHostCommandResultNotificationSource = (
  connectionString: string,
  logger?: DiagnosticLogger,
): HostCommandResultNotificationSource => ({
  notifications: Stream.callback<HostCommandResultNotification>((queue) =>
    openListenConnection(connectionString, queue, logger),
  ),
});

/**
 * Acquire the dedicated LISTEN connection and bridge result signals into the queue.
 *
 * Runs against the stream's own scope (`Scope` stays in the requirements): it
 * connects, starts listening, forwards each parsed signal, and registers teardown
 * so the connection is closed exactly once when the subscriber's scope closes.
 */
const openListenConnection = (
  connectionString: string,
  queue: Queue.Queue<HostCommandResultNotification, Cause.Done>,
  logger: DiagnosticLogger | undefined,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const client = new Client({ connectionString });

    // Forward every signal that parses; a skipped malformed payload is harmless
    // because the owner's result poll still reads the durable row — but it still
    // means corruption or version skew, so it warns.
    client.on("notification", (message) => {
      const notification = parseHostCommandResultNotification(message.payload);
      if (notification) Queue.offerUnsafe(queue, notification);
      else
        logger?.warn("malformed notification skipped", {
          channel: HOST_COMMAND_RESULT_NOTIFY_CHANNEL,
        });
    });
    client.on("error", (error) =>
      logger?.warn("listen connection error", {
        channel: HOST_COMMAND_RESULT_NOTIFY_CHANNEL,
        error: error.message,
      }),
    );

    yield* connectAndListen(client);
    logger?.info("listen connected", { channel: HOST_COMMAND_RESULT_NOTIFY_CHANNEL });

    // Tear the dedicated connection down when the subscriber's scope closes.
    yield* Effect.addFinalizer(() =>
      Effect.promise(() => {
        logger?.debug("listen closed", { channel: HOST_COMMAND_RESULT_NOTIFY_CHANNEL });
        return client.end();
      }),
    );
  });

const connectAndListen = (client: Client): Effect.Effect<void> =>
  Effect.promise(async () => {
    await client.connect();
    await client.query(`LISTEN "${HOST_COMMAND_RESULT_NOTIFY_CHANNEL}"`);
  });
