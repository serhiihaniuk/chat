import { type Cause, Effect, Queue, type Scope, Stream } from "effect";
import { Client } from "pg";

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
): TurnActivityNotificationSource => ({
  notifications: Stream.callback<TurnActivityNotification>((queue) =>
    openListenConnection(connectionString, queue),
  ),
});

const openListenConnection = (
  connectionString: string,
  queue: Queue.Queue<TurnActivityNotification, Cause.Done>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const client = new Client({ connectionString });

    client.on("notification", (message) => {
      const notification = parseTurnActivityNotification(message.payload);
      if (notification) Queue.offerUnsafe(queue, notification);
    });

    yield* connectAndListen(client);

    yield* Effect.addFinalizer(() => Effect.promise(() => client.end()));
  });

const connectAndListen = (client: Client): Effect.Effect<void> =>
  Effect.promise(async () => {
    await client.connect();
    await client.query(`LISTEN "${TURN_ACTIVITY_NOTIFY_CHANNEL}"`);
  });
