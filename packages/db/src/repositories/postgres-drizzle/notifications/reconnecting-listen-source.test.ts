import { Effect, Fiber, Stream } from "effect";
import { describe, expect, it } from "vitest";

import {
  reconnectingListenStream,
  type ListenConnection,
  type ListenConnector,
} from "./reconnecting-listen-source.js";

type FakeConnection = {
  readonly connection: ListenConnection;
  emitNotification: (payload: string | undefined) => void;
  emitError: (error: Error) => void;
  ended: boolean;
};

/** A connector whose connections the test drives by hand to force drops/retries. */
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

const runDraining = (stream: Stream.Stream<string>, sink: string[]) =>
  Effect.runFork(Stream.runForEach(stream, (value) => Effect.sync(() => void sink.push(value))));

describe("reconnecting listen stream", () => {
  it("re-feeds the rescan on connect, forwards signals, reconnects after a drop", async () => {
    const fake = createFakeConnector();
    let rescanCalls = 0;
    const received: string[] = [];
    const stream = reconnectingListenStream<string>(
      {
        connectionString: "postgres://fake",
        channel: "ch",
        parse: (payload) => payload ?? undefined,
        logger: undefined,
        onReconnect: () => {
          rescanCalls += 1;
          return Promise.resolve([`rescan-${rescanCalls}`]);
        },
      },
      fake.connector,
    );
    const fiber = runDraining(stream, received);

    // First connect re-feeds the rescan and forwards a live signal.
    await waitFor(() => fake.connections.length === 1);
    await waitFor(() => received.includes("rescan-1"));
    fake.connections[0]?.emitNotification("live-1");
    await waitFor(() => received.includes("live-1"));
    expect(received).toEqual(["rescan-1", "live-1"]);

    // A dropped connection is torn down and reconnected; the rescan runs again so a
    // signal missed during the outage is re-surfaced.
    fake.connections[0]?.emitError(new Error("connection reset"));
    await waitFor(() => fake.connections.length === 2);
    await waitFor(() => received.includes("rescan-2"));
    expect(fake.connections[0]?.ended).toBe(true);
    expect(received).toContain("rescan-2");

    // Shutdown interrupts the loop and closes the live connection.
    await Effect.runPromise(Fiber.interrupt(fiber));
    await waitFor(() => fake.connections[1]?.ended === true);
    expect(fake.connections[1]?.ended).toBe(true);
  });

  it("retries a failed initial connect", async () => {
    const fake = createFakeConnector();
    fake.failNextConnects(1);
    const received: string[] = [];
    const stream = reconnectingListenStream<string>(
      {
        connectionString: "postgres://fake",
        channel: "ch",
        parse: (payload) => payload ?? undefined,
        logger: undefined,
      },
      fake.connector,
    );
    const fiber = runDraining(stream, received);

    // The first connect throws; the retry establishes the second attempt.
    await waitFor(() => fake.connections.length === 1);
    fake.connections[0]?.emitNotification("after-retry");
    await waitFor(() => received.includes("after-retry"));
    expect(received).toContain("after-retry");

    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  it("skips a malformed payload and warns instead of faulting the feed", async () => {
    const warnings: string[] = [];
    const fake = createFakeConnector();
    const received: string[] = [];
    const stream = reconnectingListenStream<string>(
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
    );
    const fiber = runDraining(stream, received);

    await waitFor(() => fake.connections.length === 1);
    fake.connections[0]?.emitNotification("bad");
    await waitFor(() => warnings.includes("malformed notification skipped"));
    fake.connections[0]?.emitNotification("good");
    await waitFor(() => received.includes("good"));
    expect(warnings).toContain("malformed notification skipped");
    expect(received).toEqual(["good"]);

    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
