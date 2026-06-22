import { type Cause, Effect, Queue, type Scope, Stream } from "effect";
import { Client } from "pg";

import { TURN_CANCEL_NOTIFY_CHANNEL } from "#schema-contract";
import {
  parseTurnCancelNotification,
  type TurnCancelNotification,
  type TurnCancelNotificationSource,
} from "../../notifications/turn-cancel-notifications.js";

/**
 * Build the per-instance Postgres `LISTEN` source for durable cancel intent.
 *
 * `requestTurnCancellation` `pg_notify`s `TURN_CANCEL_NOTIFY_CHANNEL` on commit;
 * this source holds one dedicated connection (not from the query pool, so it
 * survives PgBouncer transaction pooling) and surfaces parsed signals to the
 * service cancel dispatcher. It mirrors the turn-event notification source so both
 * cross-instance wake signals share one shape.
 *
 * The stream is scoped: subscribing connects and `LISTEN`s, and the scope closing
 * removes the listener and ends the connection. A malformed payload is skipped,
 * not faulted, because the durable cancel intent plus the reaper already make
 * cancel resilient to a dropped signal.
 */
export const createPostgresTurnCancelNotificationSource = (
  connectionString: string,
): TurnCancelNotificationSource => ({
  notifications: Stream.callback<TurnCancelNotification>((queue) =>
    openListenConnection(connectionString, queue),
  ),
});

/**
 * Acquire the dedicated LISTEN connection and bridge cancel signals into the queue.
 *
 * Runs against the stream's own scope (`Scope` stays in the requirements): it
 * connects, starts listening, forwards each parsed signal, and registers teardown
 * so the connection is closed exactly once when the subscriber's scope closes.
 */
const openListenConnection = (
  connectionString: string,
  queue: Queue.Queue<TurnCancelNotification, Cause.Done>,
): Effect.Effect<void, never, Scope.Scope> =>
  Effect.gen(function* () {
    const client = new Client({ connectionString });

    // Forward every signal that parses; a skipped malformed payload is harmless
    // because the reaper still terminalizes a turn with durable cancel intent.
    client.on("notification", (message) => {
      const notification = parseTurnCancelNotification(message.payload);
      if (notification) Queue.offerUnsafe(queue, notification);
    });

    yield* connectAndListen(client);

    // Tear the dedicated connection down when the subscriber's scope closes.
    yield* Effect.addFinalizer(() => Effect.promise(() => client.end()));
  });

const connectAndListen = (client: Client): Effect.Effect<void> =>
  Effect.promise(async () => {
    await client.connect();
    await client.query(`LISTEN "${TURN_CANCEL_NOTIFY_CHANNEL}"`);
  });
