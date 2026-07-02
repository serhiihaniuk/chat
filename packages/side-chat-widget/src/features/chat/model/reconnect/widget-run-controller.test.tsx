import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import { resetWidgetRunStores } from "../run/widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "../run/widget-run-state.js";
import {
  useWidgetRunController,
  type WidgetRunController,
  type WidgetRunControllerInput,
} from "./widget-run-controller.js";

const REQUEST_ID = "request-1";
const TURN_ID = "turn-1";

let windowRef: Window;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: windowRef.document,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: windowRef.localStorage,
  });
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  // Use the ambient document (now the happy-dom window) so element types line up
  // with the DOM lib that react-dom expects.
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

const started = (sequence = 0): StartedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
});

const delta = (sequence: number, content: string): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-05-23T00:00:01.000Z",
  content,
});

const completed = (sequence: number): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-05-23T00:00:02.000Z",
  finishReason: "stop",
});

const eventStream = async function* (
  events: readonly SidechatStreamEvent[],
): AsyncIterable<SidechatStreamEvent> {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
};

type FakeClientState = {
  readonly client: SideChatApiClient;
  readonly createRunCalls: number[];
  readonly subscribeAfters: number[];
  readonly cancelledTurns: string[];
};

const fakeClient = (
  build: (after: number) => Promise<{ events: AsyncIterable<SidechatStreamEvent> }>,
): FakeClientState => {
  const createRunCalls: number[] = [];
  const subscribeAfters: number[] = [];
  const cancelledTurns: string[] = [];

  return {
    createRunCalls,
    subscribeAfters,
    cancelledTurns,
    client: {
      // The POST response IS the stream: identity plus the full event iterable.
      createRun: (request) => {
        createRunCalls.push(1);
        return build(-1).then((subscription) => ({
          requestId: request.requestId,
          assistantTurnId: TURN_ID,
          conversationId: "conversation-1",
          events: subscription.events,
        }));
      },
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
      cancelTurn: (assistantTurnId) => {
        cancelledTurns.push(assistantTurnId);
        return Promise.resolve({ assistantTurnId, cancelRequested: true });
      },
    },
  };
};

type Harness = {
  readonly controllerRef: { current: WidgetRunController | undefined };
  readonly replayExpired: string[];
};

const renderController = (
  client: SideChatApiClient,
  overrides: Partial<WidgetRunControllerInput> = {},
): Harness => {
  const controllerRef: { current: WidgetRunController | undefined } = { current: undefined };
  const replayExpired: string[] = [];

  const Probe = () => {
    const controller = useWidgetRunController({
      client,
      hostBridge: undefined,
      storeKey: { storageKey: "controller-test", baseUrl: undefined },
      conversationStorageKey: "controller-test",
      onReplayExpired: (conversationId) => replayExpired.push(conversationId ?? "none"),
      refreshHistory: () => {},
      ...overrides,
    });
    controllerRef.current = controller;
    // Mount-time reconnect, mirroring the production trigger.
    useEffect(() => controller.reconnect(), [controller]);
    return null;
  };

  act(() => root.render(createElement(Probe)));
  return { controllerRef, replayExpired };
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

const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 12; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const assistantContent = (harness: Harness): string =>
  harness.controllerRef.current?.run?.messages.find((message) => message.id === "assistant-1")
    ?.content ?? "";

describe("useWidgetRunController", () => {
  it("streams the run on the create call itself and applies events in order", async () => {
    const fake = fakeClient(() =>
      Promise.resolve({
        events: eventStream([started(), delta(1, "Hi "), delta(2, "there"), completed(3)]),
      }),
    );
    const harness = renderController(fake.client);

    await act(async () => {
      await harness.controllerRef.current?.startRun(startInput());
    });
    await flush();

    expect(fake.createRunCalls).toHaveLength(1);
    // Connection-bound: the create response carried the stream; no resume GET.
    expect(fake.subscribeAfters).toEqual([]);
    expect(harness.controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(assistantContent(harness)).toBe("Hi there");
  });

  it("reconnects from the last seen sequence without duplicating events", async () => {
    let opened = 0;
    const fake = fakeClient((after) => {
      opened += 1;
      // The create stream carries started + first delta then ends abruptly (no
      // terminal); the resume GET must continue from after = lastSeenSequence (1).
      if (opened === 1)
        return Promise.resolve({ events: eventStream([started(), delta(1, "Hi ")]) });
      expect(after).toBe(1);
      return Promise.resolve({ events: eventStream([delta(2, "there"), completed(3)]) });
    });
    const harness = renderController(fake.client);

    await act(async () => {
      await harness.controllerRef.current?.startRun(startInput());
    });
    await flush();

    // The first stream ended without a terminal, leaving the run mid-stream at
    // sequence 1; reconnect must resume from after = 1 and finish the turn.
    expect(harness.controllerRef.current?.run?.lastSeenSequence).toBe(1);
    act(() => harness.controllerRef.current?.reconnect());
    await flush();

    expect(fake.subscribeAfters).toEqual([1]);
    expect(assistantContent(harness)).toBe("Hi there");
    expect(harness.controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
  });

  it("cancels the live turn through the cancel endpoint", async () => {
    const fake = fakeClient(() =>
      Promise.resolve({ events: eventStream([started(), delta(1, "working")]) }),
    );
    const harness = renderController(fake.client);

    await act(async () => {
      await harness.controllerRef.current?.startRun(startInput());
    });
    await flush();

    await act(async () => {
      await harness.controllerRef.current?.cancel();
    });

    expect(fake.cancelledTurns).toEqual([TURN_ID]);
    expect(harness.controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.CANCELLED);
  });

  it("falls back to history and clears the run on replay_expired", async () => {
    const fake = fakeClient(() =>
      Promise.reject(new SideChatApiError("replay_expired", "gone", { status: 404 })),
    );
    const harness = renderController(fake.client);

    await act(async () => {
      await harness.controllerRef.current?.startRun(startInput());
    });
    await flush();

    // The create itself reported the swept buffer, before any identity frame,
    // so the fallback fires without a conversation id.
    expect(harness.replayExpired).toEqual(["none"]);
    expect(harness.controllerRef.current?.run).toBeUndefined();
  });
});
