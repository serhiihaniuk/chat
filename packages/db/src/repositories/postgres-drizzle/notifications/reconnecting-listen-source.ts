import {
  type Cause,
  Deferred,
  Duration,
  Effect,
  Queue,
  Schedule,
  type Scope,
  Stream,
} from "effect";
import { Client } from "pg";
import type { DiagnosticLogger } from "@side-chat/shared";

/**
 * Keep one Postgres `LISTEN` connection alive and reconnect it after a drop.
 *
 * The activity sources share this helper. It handles
 * connection errors, closes the dead connection, and retries with capped,
 * jittered backoff so a database restart does not crash the service.
 *
 * After reconnecting, `onReconnect` can reread durable state. This matters for
 * cancel signals because `NOTIFY` is only a hint and can be missed. The other
 * sources recover through their own snapshot or result-poll paths.
 */
export type ListenConnection = {
  readonly onNotification: (handler: (payload: string | undefined) => void) => void;
  readonly onError: (handler: (error: Error) => void) => void;
  /** Issue the `LISTEN` — called after the notification handler is registered. */
  readonly listen: () => Promise<void>;
  readonly end: () => Promise<void>;
};

/** Open a dedicated connection; the seam that lets tests drive reconnection. */
export type ListenConnector = (input: {
  readonly connectionString: string;
  readonly channel: string;
}) => Promise<ListenConnection>;

export type ReconnectingListenOptions<A> = {
  readonly connectionString: string;
  readonly channel: string;
  readonly parse: (payload: string | undefined) => A | undefined;
  readonly logger: DiagnosticLogger | undefined;
  /**
   * Durable state re-surfaced after each (re)connect. The returned records are
   * offered as synthetic notifications so a signal missed during the outage is
   * still honored. Omit it for sources that recover another way.
   */
  readonly onReconnect?: (() => Promise<readonly A[]>) | undefined;
};

/** Why a listen attempt ended: a connect, listen, or post-connect drop. */
type ListenDrop = { readonly channel: string; readonly reason: string };

const drop = (channel: string, reason: unknown): ListenDrop => ({
  channel,
  reason: reason instanceof Error ? reason.message : String(reason),
});

/** Run the reconnect rescan, swallowing a query failure to keep the listener up. */
const runRescan = async <A>(options: ReconnectingListenOptions<A>): Promise<readonly A[]> => {
  try {
    return options.onReconnect ? await options.onReconnect() : [];
  } catch (error) {
    options.logger?.warn("listen rescan failed", { ...drop(options.channel, error) });
    return [];
  }
};

/**
 * Jittered exponential backoff capped at 30s, recurring forever.
 *
 * `either` recurs if either schedule wants to and takes the smaller delay, so the
 * growing exponential is clamped to the constant 30s cap. Jitter spreads
 * reconnect attempts so many instances do not stampede a recovering database.
 */
const RECONNECT_SCHEDULE = Schedule.exponential(Duration.millis(200), 2).pipe(
  Schedule.either(Schedule.spaced(Duration.seconds(30))),
  Schedule.jittered,
);

const createPgListenConnector =
  (): ListenConnector =>
  async ({ connectionString, channel }) => {
    const client = new Client({ connectionString });
    await client.connect();
    return {
      onNotification: (handler) => client.on("notification", (message) => handler(message.payload)),
      onError: (handler) => client.on("error", handler),
      listen: async () => void (await client.query(`LISTEN "${channel}"`)),
      end: () => client.end(),
    };
  };

/**
 * Acquire a dedicated connection, closing it whenever this attempt's scope ends.
 *
 * `acquireRelease` is what guarantees no leak: the connection closes on a drop
 * (so the retry reconnects cleanly) or on scope close (shutdown). A connect
 * failure maps to a drop so the retry loop reconnects.
 */
const acquireConnection = <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector,
): Effect.Effect<ListenConnection, ListenDrop, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise({
      try: () => connect({ connectionString: options.connectionString, channel: options.channel }),
      catch: (error) => drop(options.channel, error),
    }),
    (open) => Effect.promise(() => open.end()),
  );

/** Wire the parsed-signal and drop handlers onto a fresh connection. */
const registerHandlers = <A>(
  connection: ListenConnection,
  options: ReconnectingListenOptions<A>,
  queue: Queue.Queue<A, Cause.Done>,
  dropped: Deferred.Deferred<never, ListenDrop>,
): void => {
  connection.onError((error) => {
    options.logger?.warn("listen connection error", {
      channel: options.channel,
      error: error.message,
    });
    Deferred.doneUnsafe(dropped, Effect.fail(drop(options.channel, error)));
  });
  connection.onNotification((payload) => {
    const parsed = options.parse(payload);
    if (parsed) Queue.offerUnsafe(queue, parsed);
    // We publish these payloads ourselves, so a parse failure means corruption
    // or a version skew — surface it instead of silently dropping the signal.
    else options.logger?.warn("malformed notification skipped", { channel: options.channel });
  });
};

/**
 * Hold one connection open until it drops, offering parsed signals as they land.
 *
 * The effect only ever completes by failing with the drop, which is what drives
 * the retry loop to reconnect.
 */
const openUntilDrop = <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector,
  queue: Queue.Queue<A, Cause.Done>,
): Effect.Effect<never, ListenDrop, never> =>
  Effect.scoped(
    Effect.gen(function* () {
      const connection = yield* acquireConnection(options, connect);
      const dropped = yield* Deferred.make<never, ListenDrop>();
      registerHandlers(connection, options, queue, dropped);

      yield* Effect.tryPromise({
        try: () => connection.listen(),
        catch: (error) => drop(options.channel, error),
      });
      options.logger?.info("listen connected", { channel: options.channel });

      if (options.onReconnect) {
        // Fail-open: a failed rescan must not tear the freshly-healed connection
        // down. Log and continue empty — the reaper is the ultimate backstop.
        const records = yield* Effect.promise(() => runRescan(options));
        for (const record of records) Queue.offerUnsafe(queue, record);
      }

      return yield* Deferred.await(dropped);
    }),
  );

/**
 * Reconnect forever: on each drop, log and retry with backoff.
 *
 * The schedule never exhausts, so this only stops when the forked fiber is
 * interrupted at shutdown. The durable state plus the reaper remain the backstop
 * if a signal is ever lost between a drop and its reconnect.
 */
const runReconnectLoop = <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector,
  queue: Queue.Queue<A, Cause.Done>,
): Effect.Effect<never, ListenDrop, never> =>
  openUntilDrop(options, connect, queue).pipe(
    Effect.tapError((dropped) =>
      Effect.sync(() =>
        options.logger?.info("listen reconnecting", {
          channel: dropped.channel,
          reason: dropped.reason,
        }),
      ),
    ),
    Effect.retry(RECONNECT_SCHEDULE),
  );

/**
 * Build the scoped, self-healing notification stream for one `LISTEN` channel.
 *
 * The reconnect loop is forked onto the stream's scope, so closing the scope
 * (dispatcher shutdown) interrupts it and closes the live connection. `connect` is
 * injectable so tests exercise reconnection and rescan without a real socket.
 */
export const reconnectingListenStream = <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector = createPgListenConnector(),
): Stream.Stream<A> =>
  Stream.callback<A>((queue) =>
    Effect.forkScoped(runReconnectLoop(options, connect, queue)).pipe(Effect.asVoid),
  );
