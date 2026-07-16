import { describe, expect, it } from "vitest";

import {
  createReconnectingListenStream,
  type ListenConnection,
  type ListenConnector,
} from "./reconnecting-listen-source.js";

type FakeConnection = {
  readonly connection: ListenConnection;
  emitNotification: (payload: string | undefined) => void;
  emitError: (error: Error) => void;
  ended: boolean;
};

/** A connector whose connections the test drives to force drops and retries. */
const createFakeConnector = (): {
  readonly connector: ListenConnector;
  readonly connections: FakeConnection[];
  readonly failNextConnects: (count: number) => void;
} => {
  const connections: FakeConnection[] = [];
  let connectFailures = 0;

  const connector: ListenConnector = async () => {
    if (connectFailures > 0) {
      connectFailures -= 1;
      throw new Error("connect failed");
    }

    let onNotification: (payload: string | undefined) => void = () => undefined;
    let onError: (error: Error) => void = () => undefined;
    const fake: FakeConnection = {
      connection: {
        onNotification: (handler) => {
          onNotification = handler;
        },
        onError: (handler) => {
          onError = handler;
        },
        listen: () => Promise.resolve(),
        end: () => {
          fake.ended = true;
          return Promise.resolve();
        },
      },
      emitNotification: (payload) => onNotification(payload),
      emitError: (error) => onError(error),
      ended: false,
    };
    connections.push(fake);
    return fake.connection;
  };

  return { connector, connections, failNextConnects: (count) => (connectFailures = count) };
};

const waitFor = async (predicate: () => boolean, timeoutMs = 3000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("waitFor timed out");
};

const drainStream = <A>(stream: ReadableStream<A>, sink: A[]) => {
  const reader = stream.getReader();
  const done = (async () => {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      sink.push(next.value);
    }
  })();

  return {
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

    await waitFor(() => fake.connections.length === 1);
    fake.connections[0]?.emitNotification("live-1");
    await waitFor(() => received.includes("live-1"));

    fake.connections[0]?.emitError(new Error("connection reset"));
    await waitFor(() => fake.connections.length === 2);
    expect(fake.connections[0]?.ended).toBe(true);

    fake.connections[1]?.emitNotification("live-2");
    await waitFor(() => received.includes("live-2"));
    expect(received).toEqual(["live-1", "live-2"]);

    await draining.cancel();
    expect(fake.connections[1]?.ended).toBe(true);
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

    await waitFor(() => fake.connections.length === 1);
    fake.connections[0]?.emitNotification("after-retry");
    await waitFor(() => received.includes("after-retry"));
    expect(received).toEqual(["after-retry"]);

    await draining.cancel();
  });

  it("skips a malformed payload and keeps the feed alive", async () => {
    const warnings: string[] = [];
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
          warn: (message) => void warnings.push(message),
          error: () => undefined,
        },
      },
      fake.connector,
      reconnectImmediately,
    );
    const draining = drainStream(stream, received);

    await waitFor(() => fake.connections.length === 1);
    fake.connections[0]?.emitNotification("bad");
    await waitFor(() => warnings.includes("malformed notification skipped"));
    fake.connections[0]?.emitNotification("good");
    await waitFor(() => received.includes("good"));
    expect(received).toEqual(["good"]);

    await draining.cancel();
  });
});
