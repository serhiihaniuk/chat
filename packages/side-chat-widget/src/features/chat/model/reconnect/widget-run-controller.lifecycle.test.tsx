import {
  SIDECHAT_PROTOCOL_VERSION,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { StrictMode, act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import type { SideChatApiClient } from "#entities/conversation";
import {
  getWidgetSubscriptionSlot,
  resetWidgetRunStores,
  type WidgetRunStoreKey,
} from "../run/widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "../run/widget-run-state.js";
import { useWidgetRunController, type WidgetRunController } from "./widget-run-controller.js";

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
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
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

const started: StartedEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: "evt-0",
  assistantTurnId: TURN_ID,
  sequence: 0,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
};

/** A stream that emits identity + one delta, then stays open so the run keeps running. */
const openStream = (): { events: AsyncIterable<SidechatStreamEvent>; release: () => void } => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const events = (async function* () {
    yield started;
    await gate;
  })();
  return { events, release };
};

type OpenFake = {
  readonly client: SideChatApiClient;
  readonly createRunCalls: number[];
  readonly subscribeAfters: number[];
  readonly release: () => void;
};

const openFakeClient = (): OpenFake => {
  const createRunCalls: number[] = [];
  const subscribeAfters: number[] = [];
  const stream = openStream();
  return {
    createRunCalls,
    subscribeAfters,
    release: stream.release,
    client: {
      baseUrl: "https://svc.test",
      createRun: (request) => {
        createRunCalls.push(1);
        return Promise.resolve({
          requestId: request.requestId,
          assistantTurnId: TURN_ID,
          conversationId: "conversation-1",
          events: stream.events,
        });
      },
      subscribeTurn: (_turnId, options) => {
        subscribeAfters.push(options?.after ?? -1);
        return Promise.resolve({ events: openStream().events });
      },
      resolveRun: () => Promise.resolve({ assistantTurnId: TURN_ID, status: "running" }),
      getTurnStatus: () =>
        Promise.resolve({
          assistantTurnId: TURN_ID,
          conversationId: "conversation-1",
          requestId: "request-1",
          status: "running",
        }),
      cancelTurn: (turnId) => Promise.resolve({ assistantTurnId: turnId, cancelRequested: true }),
    },
  };
};

type Harness = { readonly controllerRef: { current: WidgetRunController | undefined } };

const Probe = (props: {
  readonly client: SideChatApiClient;
  readonly storeKey: WidgetRunStoreKey;
  readonly controllerRef: { current: WidgetRunController | undefined };
}) => {
  const controller = useWidgetRunController({
    client: props.client,
    hostBridge: undefined,
    storeKey: props.storeKey,
    conversationStorageKey: props.storeKey.storageKey,
    onReplayExpired: () => undefined,
    refreshHistory: () => undefined,
  });
  props.controllerRef.current = controller;
  useEffect(() => controller.reconnect(), [controller]);
  return null;
};

const startInput = (requestId: string) => ({
  request: {
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId,
    message: { id: `${requestId}-user`, content: "hi" },
  },
  localUserMessageId: `${requestId}-user`,
  localAssistantMessageId: `${requestId}-assistant`,
  messages: [createWidgetMessage(`${requestId}-user`, "user", "hi")],
});

const flush = async (): Promise<void> => {
  for (let tick = 0; tick < 12; tick += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const macrotask = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("widget run controller lifecycle", () => {
  it("adopts the live stream across a StrictMode remount (one create, no re-subscribe)", async () => {
    const fake = openFakeClient();
    const controllerRef: Harness["controllerRef"] = { current: undefined };
    const key: WidgetRunStoreKey = { storageKey: "strict", baseUrl: "https://svc.test" };
    const probe = createElement(Probe, { client: fake.client, storeKey: key, controllerRef });

    // First mount starts a live run; its stream stays open (startRun's promise only
    // settles at the terminal, so it is fired, not awaited).
    act(() => root.render(probe));
    act(() => void controllerRef.current?.startRun(startInput("request-1")));
    await flush();
    expect(controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.STREAMING);

    // Remounting under StrictMode (unmount → double mount) must adopt the in-flight
    // stream via the shared slot — never open a second connection.
    act(() => root.render(createElement(StrictMode, null, probe)));
    await flush();

    expect(fake.createRunCalls).toHaveLength(1);
    expect(fake.subscribeAfters).toEqual([]);
    expect(controllerRef.current?.run?.status).toBe(WIDGET_RUN_STATUSES.STREAMING);
    fake.release();
  });

  it("aborts the live subscription when the widget is removed from the DOM", async () => {
    const fake = openFakeClient();
    const controllerRef: Harness["controllerRef"] = { current: undefined };
    const key: WidgetRunStoreKey = { storageKey: "leak", baseUrl: "https://svc.test" };

    act(() =>
      root.render(createElement(Probe, { client: fake.client, storeKey: key, controllerRef })),
    );
    act(() => void controllerRef.current?.startRun(startInput("request-1")));
    await flush();

    const liveController = getWidgetSubscriptionSlot(key).controller;
    expect(liveController?.signal.aborted).toBe(false);

    // Removing the last mount schedules a deferred last-owner abort.
    act(() => root.unmount());
    await macrotask();

    expect(liveController?.signal.aborted).toBe(true);
    fake.release();
  });

  it("runs two widgets with different storage keys without crossing their turns", async () => {
    const fakeA = openFakeClient();
    const fakeB = openFakeClient();
    const refA: Harness["controllerRef"] = { current: undefined };
    const refB: Harness["controllerRef"] = { current: undefined };
    const keyA: WidgetRunStoreKey = { storageKey: "widget-a", baseUrl: "https://svc.test" };
    const keyB: WidgetRunStoreKey = { storageKey: "widget-b", baseUrl: "https://svc.test" };

    act(() =>
      root.render(
        createElement(
          "div",
          null,
          createElement(Probe, { client: fakeA.client, storeKey: keyA, controllerRef: refA }),
          createElement(Probe, { client: fakeB.client, storeKey: keyB, controllerRef: refB }),
        ),
      ),
    );
    act(() => void refA.current?.startRun(startInput("request-a")));
    act(() => void refB.current?.startRun(startInput("request-b")));
    await flush();

    // Each widget owns its own live run; starting B did not replace A's turn.
    expect(refA.current?.run?.requestId).toBe("request-a");
    expect(refB.current?.run?.requestId).toBe("request-b");
    expect(refA.current?.run?.status).toBe(WIDGET_RUN_STATUSES.STREAMING);
    expect(refB.current?.run?.status).toBe(WIDGET_RUN_STATUSES.STREAMING);
    expect(fakeA.createRunCalls).toHaveLength(1);
    expect(fakeB.createRunCalls).toHaveLength(1);
    fakeA.release();
    fakeB.release();
  });
});
