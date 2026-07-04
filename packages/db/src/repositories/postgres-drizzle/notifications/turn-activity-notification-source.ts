import { type Cause, Effect, Queue, type Scope, Stream } from "effect";
import { Client } from "pg";
import type { DiagnosticLogger } from "@side-chat/shared";

import { TURN_ACTIVITY_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnActivityNotification,
  type TurnActivityNotification,
  type TurnActivityNotificationSource,
} from "../../notifications/turn-activity-notifications.js";

/**
 * Build the per-instance Postgres `LISTEN` source for turn-lifecycle signals.
 *
 * Mirrors the turn-event source: one dedicated connection (not from the query
 * pool, so it survives PgBouncer transaction pooling) `LISTEN`s on
 * `TURN_ACTIVITY_NOTIFY_CHANNEL` and surfaces parsed signals to the activity
 * dispatcher. The stream is scoped — subscribing connects and listens; the scope
 * closing tears the connection down. A malformed payload is skipped, not faulted.
 */
export const createPostgresTurnActivityNotificationSource = (
  connectionString: string,
  logger?: DiagnosticLogger,
): TurnActivityNotificationSource => ({
  notifications: Stream.callback<TurnActivityNotification>((queue) =>
    openListenConnection(connectionString, queue, logger),
  ),
});

const openListenConnection = (
  connectionString: string,
  queue: Queue.Queue<TurnActivityNotification, Cause.Done>,
  logger: DiagnosticLogger | undefined,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const client = new Client({ connectionString });

    client.on("notification", (message) => {
      const notification = parseTurnActivityNotification(message.payload);
      if (notification) Queue.offerUnsafe(queue, notification);
      // A dropped signal is a real (if unlikely) fault: we publish these payloads
      // ourselves, so a parse failure means corruption or a version skew.
      else
        logger?.warn("malformed notification skipped", { channel: TURN_ACTIVITY_NOTIFY_CHANNEL });
    });
    client.on("error", (error) =>
      logger?.warn("listen connection error", {
        channel: TURN_ACTIVITY_NOTIFY_CHANNEL,
        error: error.message,
      }),
    );

    yield* connectAndListen(client);
    logger?.info("listen connected", { channel: TURN_ACTIVITY_NOTIFY_CHANNEL });

    yield* Effect.addFinalizer(() =>
      Effect.promise(() => {
        logger?.debug("listen closed", { channel: TURN_ACTIVITY_NOTIFY_CHANNEL });
        return client.end();
      }),
    );
  });

const connectAndListen = (client: Client): Effect.Effect<void> =>
  Effect.promise(async () => {
    await client.connect();
    await client.query(`LISTEN "${TURN_ACTIVITY_NOTIFY_CHANNEL}"`);
  });
