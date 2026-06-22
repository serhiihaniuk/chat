import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import {
  getWidgetRunStore,
  resetWidgetRunStores,
  type WidgetRunStore,
} from "./widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "./widget-run-state.js";

const REQUEST_ID = "request-1";
const ASSISTANT_ID = "assistant-1";

afterEach(() => {
  resetWidgetRunStores();
});

const startStore = (): WidgetRunStore => {
  const store = getWidgetRunStore({ storageKey: "test", baseUrl: undefined });
  store.start({
    requestId: REQUEST_ID,
    localUserMessageId: "user-1",
    localAssistantMessageId: ASSISTANT_ID,
    messages: [
      createWidgetMessage("user-1", "user", "hi"),
      createWidgetMessage(ASSISTANT_ID, "assistant", "", true),
    ],
  });
  return store;
};

const started = (sequence = 0): StartedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
});

const delta = (sequence: number, content: string): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:01.000Z",
  content,
});

const completed = (sequence: number): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:02.000Z",
  finishReason: "stop",
  usage: { totalTokens: 7 },
});

const applyEvents = (store: WidgetRunStore, events: readonly SidechatStreamEvent[]): void => {
  for (const event of events) store.dispatch(REQUEST_ID, { type: "event", event });
};

const assistantContent = (store: WidgetRunStore): string =>
  store.getSnapshot()?.messages.find((message) => message.id === ASSISTANT_ID)?.content ?? "";

describe("widget run store", () => {
  it("applies started, delta, and completed in order into the projection", () => {
    const store = startStore();

    applyEvents(store, [started(), delta(1, "Hello "), delta(2, "world"), completed(3)]);

    const run = store.getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(run?.conversationId).toBe("conversation-1");
    expect(run?.lastSeenSequence).toBe(3);
    expect(run?.usage).toEqual({ totalTokens: 7 });
    expect(assistantContent(store)).toBe("Hello world");
    // A completed event closes the bubble: isStreaming must clear so the thinking
    // indicator resolves (it used to linger when switching chats mid-turn).
    expect(run?.messages.find((message) => message.id === ASSISTANT_ID)?.isStreaming).toBe(false);
  });

  it("ignores events at or below the last seen sequence (idempotent replay)", () => {
    const store = startStore();
    applyEvents(store, [started(), delta(1, "Hello "), delta(2, "world")]);

    // A reconnect replays from -1 again; already-applied events must be dropped.
    applyEvents(store, [started(), delta(1, "Hello "), delta(2, "world"), completed(3)]);

    expect(assistantContent(store)).toBe("Hello world");
    expect(store.getSnapshot()?.lastSeenSequence).toBe(3);
    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
  });

  it("transitions submitted -> streaming -> reconnecting -> streaming", () => {
    const store = startStore();
    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.SUBMITTED);

    applyEvents(store, [started(), delta(1, "partial")]);
    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.STREAMING);

    store.dispatch(REQUEST_ID, { type: "reconnect-started" });
    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.RECONNECTING);
    expect(store.getSnapshot()?.reconnectAttempt).toBe(1);

    // Replaying the tail past the offset resumes streaming and appends nothing new.
    applyEvents(store, [delta(1, "partial"), completed(2)]);
    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(assistantContent(store)).toBe("partial");
  });

  it("marks cancelled from a terminal action and closes the bubble", () => {
    const store = startStore();
    applyEvents(store, [started(), delta(1, "in progress")]);

    store.dispatch(REQUEST_ID, { type: "terminal", status: WIDGET_RUN_STATUSES.CANCELLED });

    const run = store.getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.CANCELLED);
    expect(run?.messages.find((message) => message.id === ASSISTANT_ID)?.isStreaming).toBe(false);
  });

  it("does not override a terminal status with a late event", () => {
    const store = startStore();
    applyEvents(store, [started(), completed(1)]);

    // A stray delta after completed must not reopen the run.
    applyEvents(store, [delta(2, "late")]);

    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(assistantContent(store)).toBe("");
  });

  it("drops dispatches for a replaced run", () => {
    const store = startStore();
    store.start({
      requestId: "request-2",
      localUserMessageId: "user-2",
      localAssistantMessageId: "assistant-2",
      messages: [createWidgetMessage("assistant-2", "assistant", "", true)],
    });

    // The first run's late event targets a stale requestId and is ignored.
    store.dispatch(REQUEST_ID, { type: "event", event: delta(1, "stale") });

    expect(store.getSnapshot()?.requestId).toBe("request-2");
    expect(store.getSnapshot()?.lastSeenSequence).toBe(-1);
  });

  it("notifies subscribers and clears on demand", () => {
    const store = startStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    applyEvents(store, [started()]);
    expect(notifications).toBeGreaterThan(0);

    store.clear();
    expect(store.getSnapshot()).toBeUndefined();
    unsubscribe();
  });

  it("scopes runs per widget instance key", () => {
    const first = getWidgetRunStore({ storageKey: "a", baseUrl: undefined });
    const second = getWidgetRunStore({ storageKey: "b", baseUrl: undefined });
    expect(first).not.toBe(second);
    expect(getWidgetRunStore({ storageKey: "a", baseUrl: undefined })).toBe(first);
  });
});
