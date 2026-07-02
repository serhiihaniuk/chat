import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { resetWidgetRunStores } from "../run/widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "../run/widget-run-state.js";
import { useWidgetRunController, type WidgetRunController } from "./widget-run-controller.js";

const REQUEST_ID = "request-1";
const TURN_ID = "turn-1";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", { configurable: true, value: windowRef.document });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: windowRef.localStorage,
  });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  resetWidgetRunStores();
  windowRef.close();
  vi.restoreAllMocks();
});

const event = (sequence: number) => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-07-02T00:00:00.000Z",
});

const started = (): StartedEvent => ({
  ...event(0),
  type: "sidechat.started",
  conversationId: "conversation-1",
});

const delta = (sequence: number, content: string): DeltaEvent => ({
  ...event(sequence),
  type: "sidechat.delta",
  content,
});

const completed = (sequence: number): CompletedEvent => ({
  ...event(sequence),
  type: "sidechat.completed",
  finishReason: "stop",
});

const eventStream = async function* (
  events: readonly SidechatStreamEvent[],
): AsyncIterable<SidechatStreamEvent> {
  for (const item of events) {
    await Promise.resolve();
    yield item;
  }
};

/** A dropped connection: yields its events, then throws like the SSE reader does. */
const droppingStream = async function* (
  events: readonly SidechatStreamEvent[],
): AsyncIterable<SidechatStreamEvent> {
  yield* eventStream(events);
  throw new SideChatApiError("missing_terminal", "SSE stream ended before a terminal event");
};

const fakeClient = (
  build: (after: number) => Promise<{ events: AsyncIterable<SidechatStreamEvent> }>,
): { readonly client: SideChatApiClient; readonly subscribeAfters: number[] } => {
  const subscribeAfters: number[] = [];
  return {
    subscribeAfters,
    client: {
      createRun: (request) =>
        build(-1).then((subscription) => ({
          requestId: request.requestId,
          assistantTurnId: TURN_ID,
          conversationId: "conversation-1",
          events: subscription.events,
        })),
      subscribeTurn: (_assistantTurnId, options) => {
        subscribeAfters.push(options?.after ?? -1);
        return build(options?.after ?? -1);
      },
      resolveRun: () => Promise.resolve({ assistantTurnId: TURN_ID, status: "running" }),
      getTurnStatus: () =>
        Promise.resolve({
          assistantTurnId: TURN_ID,
          conversationId: "conversation-1",
          requestId: REQUEST_ID,
          status: "running",
        }),
      cancelTurn: (assistantTurnId) => Promise.resolve({ assistantTurnId, cancelRequested: true }),
    },
  };
};

const renderController = (client: SideChatApiClient) => {
  const controllerRef: { current: WidgetRunController | undefined } = { current: undefined };
  const Probe = () => {
    controllerRef.current = useWidgetRunController({
      client,
      hostBridge: undefined,
      storeKey: { storageKey: "controller-recovery-test", baseUrl: undefined },
      conversationStorageKey: "controller-recovery-test",
      onReplayExpired: () => undefined,
      refreshHistory: () => undefined,
    });
    return null;
  };
  act(() => root.render(createElement(Probe)));
  return controllerRef;
};

const startInput = () => ({
  request: {
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: REQUEST_ID,
    message: { id: "user-1", content: "hi" },
  },
  localUserMessageId: "user-1",
  localAssistantMessageId: "assistant-1",
  messages: [
    createWidgetMessage("user-1", "user", "hi"),
    createWidgetMessage("assistant-1", "assistant", "", true),
  ],
});

const assistantContent = (controllerRef: { current: WidgetRunController | undefined }): string =>
  controllerRef.current?.run?.messages.find((message) => message.id === "assistant-1")?.content ??
  "";

describe("useWidgetRunController transport recovery", () => {
  it("recovers a dropped stream automatically, resuming from the cursor", async () => {
    // The POST stream THROWS mid-turn (a real dropped connection, unlike the
    // clean-end fake in the sibling test file). Recovery must resubscribe from
    // after = 1 on its own — no manual reconnect — and the overlap replay must
    // not duplicate content.
    let opened = 0;
    const fake = fakeClient((after) => {
      opened += 1;
      if (opened === 1) {
        return Promise.resolve({ events: droppingStream([started(), delta(1, "Hi ")]) });
      }
      expect(after).toBe(1);
      return Promise.resolve({
        events: eventStream([delta(1, "Hi "), delta(2, "there"), completed(3)]),
      });
    });
    const controllerRef = renderController(fake.client);

    await act(async () => {
      await controllerRef.current?.startRun(startInput());
    });

    expect(fake.subscribeAfters).toEqual([1]);
    expect(assistantContent(controllerRef)).toBe("Hi there");
    expect(controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
  });

  it("persists the run marker once per run, not per delta", async () => {
    const fake = fakeClient(() =>
      Promise.resolve({
        events: eventStream([started(), delta(1, "a"), delta(2, "b"), delta(3, "c"), completed(4)]),
      }),
    );
    const setItem = vi.spyOn(globalThis.localStorage, "setItem");
    const controllerRef = renderController(fake.client);

    await act(async () => {
      await controllerRef.current?.startRun(startInput());
    });

    const markerWrites = setItem.mock.calls.filter(([key]) => key.endsWith(":active-run"));
    expect(markerWrites).toHaveLength(1);
  });
});
