import { type Cause, Effect, Queue, Scope, Stream } from "effect";
import { Client } from "pg";

import { TURN_EVENTS_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnEventNotification,
  type TurnEventNotification,
  type TurnEventNotificationSource,
} from "../../turn-event-notifications.js";

/**
 * Build the per-instance Postgres `LISTEN` notification source.
 *
 * This is the only place in the system that issues `LISTEN`. The append writer
 * `pg_notify`s `TURN_EVENTS_NOTIFY_CHANNEL` on commit; this source holds one
 * dedicated connection (not from the query pool, so it survives PgBouncer
 * transaction pooling) and surfaces parsed signals to the service dispatcher.
 *
 * The stream is scoped: subscribing connects and `LISTEN`s, and the scope closing
 * removes the listener and ends the connection. A malformed payload is skipped,
 * not faulted, because the durable log plus the subscriber poll already make
 * delivery resilient to a dropped signal.
 */
export const createPostgresTurnEventNotificationSource = (
  connectionString: string,
): TurnEventNotificationSource => ({
  notifications: Stream.callback<TurnEventNotification>((queue) =>
    openListenConnection(connectionString, queue),
  ),
});

/**
 * Acquire the dedicated LISTEN connection and bridge notifications into the queue.
 *
 * Runs against the stream's own scope (`Scope` stays in the requirements): it
 * connects, starts listening, forwards each parsed signal, and registers teardown
 * so the connection is closed exactly once when the subscriber's scope closes.
 * The effect returns after setup; the queue keeps the stream open until the scope
 * is interrupted.
 */
const openListenConnection = (
  connectionString: string,
  queue: Queue.Queue<TurnEventNotification, Cause.Done>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const client = new Client({ connectionString });

    // Forward every signal that parses; a skipped malformed payload is harmless
    // because the subscriber safety poll still advances from the durable log.
    client.on("notification", (message) => {
      const notification = parseTurnEventNotification(message.payload);
      if (notification) Queue.offerUnsafe(queue, notification);
    });

    yield* connectAndListen(client);

    // Tear the dedicated connection down when the subscriber's scope closes.
    yield* Effect.addFinalizer(() => Effect.promise(() => client.end()));
  });

const connectAndListen = (client: Client): Effect.Effect<void> =>
  Effect.promise(async () => {
    await client.connect();
    await client.query(`LISTEN "${TURN_EVENTS_NOTIFY_CHANNEL}"`);
  });
