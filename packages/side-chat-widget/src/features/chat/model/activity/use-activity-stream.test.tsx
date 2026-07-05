import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TURN_ACTIVITY_EVENT_TYPE, type TurnActivityEvent } from "@side-chat/chat-protocol";
import type { SideChatApiClient } from "#entities/conversation";
import { useActivityStream } from "./use-activity-stream.js";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", { configurable: true, value: windowRef.document });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  windowRef.close();
});

const activityEvent = (conversationId: string, status: string): TurnActivityEvent => ({
  type: TURN_ACTIVITY_EVENT_TYPE,
  conversationId,
  assistantTurnId: `turn_${conversationId}`,
  status,
});

const streamOf = (events: readonly TurnActivityEvent[]) => ({
  events: (async function* () {
    for (const event of events) {
      await Promise.resolve();
      yield event;
    }
  })(),
});

/** An activity stream that emits one event then stays open (a healthy connection). */
const openActivityStream = () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events = (async function* () {
    yield activityEvent("c1", "running");
    await gate;
  })();
  return { events, release };
};

const renderActivity = (
  client: Pick<SideChatApiClient, "subscribeActivity">,
  onEvent?: (event: TurnActivityEvent) => void,
) => {
  const ref: { current: ReadonlySet<string> } = { current: new Set() };
  const Probe = () => {
    ref.current = useActivityStream({ client, onEvent });
    return null;
  };
  act(() => root.render(createElement(Probe)));
  return ref;
};

const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 12; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

describe("useActivityStream", () => {
  it("tracks running conversations and clears them on a terminal status", async () => {
    const client: Pick<SideChatApiClient, "subscribeActivity"> = {
      subscribeActivity: () =>
        Promise.resolve(
          streamOf([
            activityEvent("c1", "running"),
            activityEvent("c2", "running"),
            activityEvent("c1", "completed"),
          ]),
        ),
    };

    const ref = renderActivity(client);
    await flush();

    expect([...ref.current]).toEqual(["c2"]);
  });

  it("returns an empty set when the client cannot stream activity", async () => {
    const ref = renderActivity({});
    await flush();

    expect(ref.current.size).toBe(0);
  });

  it("forwards every event to onEvent so a viewing tab can resume a turn", async () => {
    const seen: Array<{ conversationId: string; status: string }> = [];
    const client: Pick<SideChatApiClient, "subscribeActivity"> = {
      subscribeActivity: () =>
        Promise.resolve(
          streamOf([activityEvent("c1", "running"), activityEvent("c1", "completed")]),
        ),
    };

    renderActivity(client, (event) =>
      seen.push({ conversationId: event.conversationId, status: event.status }),
    );
    await flush();

    expect(seen).toEqual([
      { conversationId: "c1", status: "running" },
      { conversationId: "c1", status: "completed" },
    ]);
  });

  it("backs off exponentially between reconnect attempts when the stream keeps failing", async () => {
    vi.useFakeTimers();
    // Full jitter → the delay equals the ceiling, so the backoff is deterministic.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(1);
    let calls = 0;
    const client: Pick<SideChatApiClient, "subscribeActivity"> = {
      subscribeActivity: () => {
        calls += 1;
        return Promise.reject(new Error("down"));
      },
    };
    const Probe = () => {
      useActivityStream({ client });
      return null;
    };

    act(() => root.render(createElement(Probe)));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    // Ceilings escalate 500 → 1000 → 2000 ms; the attempt fires as each elapses.
    await vi.advanceTimersByTimeAsync(500);
    expect(calls).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toBe(4);

    randomSpy.mockRestore();
    vi.useRealTimers();
  });

  it("refetches the list on tab focus without aborting a healthy stream", async () => {
    let subscribeCalls = 0;
    let onConnectedCalls = 0;
    const stream = openActivityStream();
    const client: Pick<SideChatApiClient, "subscribeActivity"> = {
      subscribeActivity: () => {
        subscribeCalls += 1;
        return Promise.resolve({ events: stream.events });
      },
    };
    const Probe = () => {
      useActivityStream({ client, onConnected: () => (onConnectedCalls += 1) });
      return null;
    };

    act(() => root.render(createElement(Probe)));
    await flush();
    expect(subscribeCalls).toBe(1);
    expect(onConnectedCalls).toBe(1);

    // A tab refocus refetches the list but must NOT reopen the healthy stream.
    // Dispatch on the happy-dom document (the same object the hook listens on).
    act(() => {
      windowRef.document.dispatchEvent(new windowRef.Event("visibilitychange"));
    });
    await flush();

    expect(subscribeCalls).toBe(1);
    expect(onConnectedCalls).toBe(2);
    stream.release();
  });
});
