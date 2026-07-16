import { Client } from "pg";
import type { DiagnosticLogger } from "@side-chat/shared";

const INITIAL_RECONNECT_DELAY_MS = 200;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MIN_JITTER_FACTOR = 0.8;
const JITTER_FACTOR_RANGE = 0.4;

/**
 * Keep one PostgreSQL `LISTEN` connection alive and expose its notifications as
 * a native stream. Product snapshots remain authoritative; this adapter only
 * delivers low-latency invalidations and reconnects after transient failures.
 */
export type ListenConnection = {
  readonly onNotification: (handler: (payload: string | undefined) => void) => void;
  readonly onError: (handler: (error: Error) => void) => void;
  readonly listen: () => Promise<void>;
  readonly end: () => Promise<void>;
};

/** Open a dedicated connection; tests replace this seam to drive connection failures. */
export type ListenConnector = (input: {
  readonly connectionString: string;
  readonly channel: string;
}) => Promise<ListenConnection>;

export type ReconnectingListenOptions<A> = {
  readonly connectionString: string;
  readonly channel: string;
  readonly parse: (payload: string | undefined) => A | undefined;
  readonly logger: DiagnosticLogger | undefined;
};

type ListenDrop = { readonly channel: string; readonly reason: string };
type ReconnectDelay = (attempt: number) => number;

const describeDrop = (channel: string, reason: unknown): ListenDrop => ({
  channel,
  reason: reason instanceof Error ? reason.message : String(reason),
});

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

/** Capped exponential backoff with bounded jitter to spread reconnecting instances. */
const reconnectDelayMs: ReconnectDelay = (attempt) => {
  const exponentialDelay = INITIAL_RECONNECT_DELAY_MS * 2 ** attempt;
  const cappedDelay = Math.min(exponentialDelay, MAX_RECONNECT_DELAY_MS);
  const jitterFactor = MIN_JITTER_FACTOR + Math.random() * JITTER_FACTOR_RANGE;
  return Math.round(cappedDelay * jitterFactor);
};

const waitForDelay = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted || delayMs <= 0) {
      resolve();
      return;
    }

    const finish = (): void => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timeout = setTimeout(finish, delayMs);
    signal.addEventListener("abort", finish, { once: true });
  });

const closeConnection = async (
  connection: ListenConnection,
  options: ReconnectingListenOptions<unknown>,
): Promise<void> => {
  try {
    await connection.end();
  } catch (error) {
    options.logger?.warn("listen connection close failed", {
      ...describeDrop(options.channel, error),
    });
  }
};

const observeConnection = <A>(
  connection: ListenConnection,
  options: ReconnectingListenOptions<A>,
  controller: ReadableStreamDefaultController<A>,
  signal: AbortSignal,
): { readonly dropped: Promise<ListenDrop | undefined>; readonly dispose: () => void } => {
  let settle: (result: ListenDrop | undefined) => void = () => undefined;
  const dropped = new Promise<ListenDrop | undefined>((resolve) => {
    settle = resolve;
  });
  const abort = (): void => settle(undefined);

  connection.onError((error) => {
    options.logger?.warn("listen connection error", {
      ...describeDrop(options.channel, error),
    });
    settle(describeDrop(options.channel, error));
  });
  connection.onNotification((payload) => {
    if (signal.aborted) return;
    const notification = options.parse(payload);
    if (notification) controller.enqueue(notification);
    else options.logger?.warn("malformed notification skipped", { channel: options.channel });
  });
  signal.addEventListener("abort", abort, { once: true });

  return {
    dropped,
    dispose: () => signal.removeEventListener("abort", abort),
  };
};

const runListenAttempt = async <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector,
  controller: ReadableStreamDefaultController<A>,
  signal: AbortSignal,
): Promise<ListenDrop | undefined> => {
  let connection: ListenConnection | undefined;
  let disposeObservation = (): void => undefined;

  try {
    connection = await connect({
      connectionString: options.connectionString,
      channel: options.channel,
    });
    if (signal.aborted) return undefined;

    const observation = observeConnection(connection, options, controller, signal);
    disposeObservation = observation.dispose;
    await connection.listen();
    options.logger?.info("listen connected", { channel: options.channel });
    return await observation.dropped;
  } catch (error) {
    return signal.aborted ? undefined : describeDrop(options.channel, error);
  } finally {
    disposeObservation();
    if (connection) await closeConnection(connection, options);
  }
};

const runReconnectLoop = async <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector,
  delayForAttempt: ReconnectDelay,
  controller: ReadableStreamDefaultController<A>,
  signal: AbortSignal,
): Promise<void> => {
  let attempt = 0;

  while (!signal.aborted) {
    const dropped = await runListenAttempt(options, connect, controller, signal);
    if (!dropped || signal.aborted) return;

    options.logger?.info("listen reconnecting", dropped);
    await waitForDelay(delayForAttempt(attempt), signal);
    attempt += 1;
  }
};

/**
 * Build the self-healing native notification stream for one `LISTEN` channel.
 * Cancelling the stream stops retries and closes the live PostgreSQL connection.
 */
export const createReconnectingListenStream = <A>(
  options: ReconnectingListenOptions<A>,
  connect: ListenConnector = createPgListenConnector(),
  delayForAttempt: ReconnectDelay = reconnectDelayMs,
): ReadableStream<A> => {
  const abortController = new AbortController();
  let reconnectLoop: Promise<void> | undefined;

  return new ReadableStream<A>({
    start: (controller) => {
      reconnectLoop = runReconnectLoop(
        options,
        connect,
        delayForAttempt,
        controller,
        abortController.signal,
      );
    },
    cancel: () => {
      abortController.abort();
      return reconnectLoop;
    },
  });
};
