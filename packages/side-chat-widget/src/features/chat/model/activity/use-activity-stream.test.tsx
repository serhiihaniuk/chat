import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

const renderActivity = (client: Pick<SideChatApiClient, "subscribeActivity">) => {
  const ref: { current: ReadonlySet<string> } = { current: new Set() };
  const Probe = () => {
    ref.current = useActivityStream({ client });
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
});
