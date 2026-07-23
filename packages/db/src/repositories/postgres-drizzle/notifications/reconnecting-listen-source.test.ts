import { describe, expect, it } from "vitest";

import {
  createReconnectingListenStream,
  type ListenConnection,
  type ListenConnector,
} from "./reconnecting-listen-source.js";

type FakeConnection = {
  readonly connection: ListenConnection;
  readonly ready: Promise<void>;
  emitNotification: (payload: string | undefined) => void;
  emitError: (error: Error) => void;
  ended: boolean;
};

/** A connector whose connections the test drives to force drops and retries. */
const createFakeConnector = (): {
  readonly connector: ListenConnector;
  readonly connections: FakeConnection[];
  readonly failNextConnects: (count: number) => void;
  readonly waitForConnection: (index: number) => Promise<FakeConnection>;
} => {
  const connections: FakeConnection[] = [];
  const connectionWaiters = new Map<number, ReturnType<typeof createDeferred<FakeConnection>>>();
  let connectFailures = 0;

  const connector: ListenConnector = async () => {
    if (connectFailures > 0) {
      connectFailures -= 1;
      throw new Error("connect failed");
    }

    let onNotification: (payload: string | undefined) => void = () => undefined;
    let onError: (error: Error) => void = () => undefined;
    const listening = createDeferred<void>();
    const fake: FakeConnection = {
      connection: {
        onNotification: (handler) => {
          onNotification = handler;
        },
        onError: (handler) => {
          onError = handler;
        },
        listen: () => {
          listening.resolve();
          connectionWaiters.get(connections.indexOf(fake))?.resolve(fake);
          connectionWaiters.delete(connections.indexOf(fake));
          return Promise.resolve();
        },
        end: () => {
          fake.ended = true;
          return Promise.resolve();
        },
      },
      emitNotification: (payload) => onNotification(payload),
      emitError: (error) => onError(error),
      ended: false,
      ready: listening.promise,
    };
    connections.push(fake);
    return fake.connection;
  };

  return {
    connector,
    connections,
    failNextConnects: (count) => (connectFailures = count),
    waitForConnection: (index) => {
      const existing = connections[index];
      if (existing !== undefined) return existing.ready.then(() => existing);
      const waiting = connectionWaiters.get(index) ?? createDeferred<FakeConnection>();
      connectionWaiters.set(index, waiting);
      return waiting.promise;
    },
  };
};

const drainStream = <A>(stream: ReadableStream<A>, sink: A[]) => {
  const reader = stream.getReader();
  const buffered: A[] = [];
  const valueWaiters: Array<ReturnType<typeof createDeferred<A>>> = [];
  const done = (async () => {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      sink.push(next.value);
      const waiter = valueWaiters.shift();
      if (waiter === undefined) buffered.push(next.value);
      else waiter.resolve(next.value);
    }
  })();

  return {
    nextValue: (): Promise<A> => {
      const next = buffered.shift();
      if (next !== undefined) return Promise.resolve(next);
      const waiting = createDeferred<A>();
      valueWaiters.push(waiting);
      return waiting.promise;
    },
    cancel: async (): Promise<void> => {
      await reader.cancel();
      await done;
    },
  };
};

const reconnectImmediately = (): number => 0;

describe("reconnecting listen stream", () => {
  it("forwards notifications, reconnects after a drop, and closes on cancellation", async () => {
    const fake = createFakeConnector();
    const received: string[] = [];
    const stream = createReconnectingListenStream<string>(
      {
        connectionString: "postgres://fake",
        channel: "ch",
        parse: (payload) => payload ?? undefined,
        logger: undefined,
      },
      fake.connector,
      reconnectImmediately,
    );
    const draining = drainStream(stream, received);

    const first = await fake.waitForConnection(0);
    first.emitNotification("live-1");
    await expect(draining.nextValue()).resolves.toBe("live-1");

    first.emitError(new Error("connection reset"));
    const second = await fake.waitForConnection(1);
    expect(first.ended).toBe(true);

    second.emitNotification("live-2");
    await expect(draining.nextValue()).resolves.toBe("live-2");
    expect(received).toEqual(["live-1", "live-2"]);

    await draining.cancel();
    expect(second.ended).toBe(true);
  });

  it("retries a failed initial connection", async () => {
    const fake = createFakeConnector();
    fake.failNextConnects(1);
    const received: string[] = [];
    const stream = createReconnectingListenStream<string>(
      {
        connectionString: "postgres://fake",
        channel: "ch",
        parse: (payload) => payload ?? undefined,
        logger: undefined,
      },
      fake.connector,
      reconnectImmediately,
    );
    const draining = drainStream(stream, received);

    const connection = await fake.waitForConnection(0);
    connection.emitNotification("after-retry");
    await expect(draining.nextValue()).resolves.toBe("after-retry");
    expect(received).toEqual(["after-retry"]);

    await draining.cancel();
  });

  it("skips a malformed payload and keeps the feed alive", async () => {
    const warnings: string[] = [];
    const warned = createDeferred<string>();
    const fake = createFakeConnector();
    const received: string[] = [];
    const stream = createReconnectingListenStream<string>(
      {
        connectionString: "postgres://fake",
        channel: "ch",
        parse: (payload) => (payload === "good" ? payload : undefined),
        logger: {
          debug: () => undefined,
          info: () => undefined,
          warn: (message) => {
            warnings.push(message);
            warned.resolve(message);
          },
          error: () => undefined,
        },
      },
      fake.connector,
      reconnectImmediately,
    );
    const draining = drainStream(stream, received);

    const connection = await fake.waitForConnection(0);
    connection.emitNotification("bad");
    await expect(warned.promise).resolves.toBe("malformed notification skipped");
    connection.emitNotification("good");
    await expect(draining.nextValue()).resolves.toBe("good");
    expect(received).toEqual(["good"]);

    await draining.cancel();
  });
});

function createDeferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolve = (_value: Value): void => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
