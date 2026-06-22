import { toMessageId, toProtocolSequence, type HistoryMessage } from "@side-chat/chat-protocol";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SideChatApiClient } from "#entities/conversation";
import { readActiveRunMarker, writeActiveRunMarker } from "../reconnect/widget-run-marker.js";
import {
  getWidgetRunStore,
  resetWidgetRunStores,
  type WidgetRunStore,
} from "../run/widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "../run/widget-run-state.js";
import { resumeRunFromMarker } from "./widget-run-resume.js";
import type { RunLifecycleContext, SubscribeTarget } from "./widget-subscription-lifecycle.js";

const STORAGE_KEY = "resume-test";
const REQUEST_ID = "request-1";
const TURN_ID = "turn-1";
const CONVERSATION_ID = "conversation-1";

let windowRef: Window;

beforeEach(() => {
  windowRef = new Window();
  Object.defineProperty(globalThis, "window", { configurable: true, value: windowRef });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: windowRef.localStorage,
  });
});

afterEach(() => {
  resetWidgetRunStores();
  windowRef.close();
});

const historyMessage = (
  id: string,
  role: "user" | "assistant",
  content: string,
): HistoryMessage => ({
  id: toMessageId(id),
  role,
  content,
  sequence: toProtocolSequence(0),
});

// createRun/subscribeTurn are never reached: resumeRunFromMarker drives the
// passed-in subscribe callback, not the client's stream methods.
const fakeClient = (overrides: Partial<SideChatApiClient> = {}): SideChatApiClient => ({
  createRun: () => Promise.reject(new Error("createRun is not used by resumeRunFromMarker")),
  subscribeTurn: () =>
    Promise.reject(new Error("subscribeTurn is not used by resumeRunFromMarker")),
  resolveRun: () => Promise.resolve({ assistantTurnId: TURN_ID, status: "running" }),
  cancelTurn: (assistantTurnId) => Promise.resolve({ assistantTurnId, cancelRequested: true }),
  getTurnStatus: () =>
    Promise.resolve({
      assistantTurnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      requestId: REQUEST_ID,
      status: "running",
    }),
  readHistory: () => Promise.resolve({ conversationId: CONVERSATION_ID, messages: [] }),
  ...overrides,
});

const context = (
  client: SideChatApiClient,
  refreshHistory: (conversationId: string | undefined) => void = () => {},
): RunLifecycleContext => ({
  client,
  hostBridge: undefined,
  conversationStorageKey: STORAGE_KEY,
  onReplayExpired: () => {},
  refreshHistory,
});

const store = (): WidgetRunStore =>
  getWidgetRunStore({ storageKey: STORAGE_KEY, baseUrl: undefined });

const captureSubscribe = () => {
  const targets: SubscribeTarget[] = [];
  return { targets, subscribe: (target: SubscribeTarget) => void targets.push(target) };
};

describe("resumeRunFromMarker", () => {
  it("seeds the run from history and replays the durable log from -1 for a running turn", async () => {
    // A full reload keeps the marker but loses the in-memory store.
    writeActiveRunMarker(STORAGE_KEY, {
      requestId: REQUEST_ID,
      assistantTurnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      lastSeenSequence: 4,
    });
    const client = fakeClient({
      readHistory: () =>
        Promise.resolve({
          conversationId: CONVERSATION_ID,
          messages: [historyMessage("user-1", "user", "hi")],
        }),
    });
    const { targets, subscribe } = captureSubscribe();

    await resumeRunFromMarker(context(client), store(), subscribe);

    // The view is rebuilt: the history prompt plus a fresh pending assistant bubble.
    const run = store().getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.RECONNECTING);
    expect(run?.assistantTurnId).toBe(TURN_ID);
    expect(run?.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(run?.messages.at(-1)?.isStreaming).toBe(true);
    // The whole durable log is replayed (after = -1), not from the marker offset.
    expect(targets).toEqual([
      {
        requestId: REQUEST_ID,
        assistantTurnId: TURN_ID,
        conversationId: CONVERSATION_ID,
        after: -1,
        resuming: true,
      },
    ]);
  });

  it("does not resume a turn that already finished and clears the stale marker", async () => {
    writeActiveRunMarker(STORAGE_KEY, {
      requestId: REQUEST_ID,
      assistantTurnId: TURN_ID,
      conversationId: CONVERSATION_ID,
      lastSeenSequence: 9,
    });
    // A terminal turn is shown by history; resuming it would duplicate the bubble.
    const client = fakeClient({
      getTurnStatus: () =>
        Promise.resolve({
          assistantTurnId: TURN_ID,
          conversationId: CONVERSATION_ID,
          requestId: REQUEST_ID,
          status: "completed",
        }),
    });
    const { targets, subscribe } = captureSubscribe();
    const refreshedHistoryFor: (string | undefined)[] = [];

    await resumeRunFromMarker(
      context(client, (id) => refreshedHistoryFor.push(id)),
      store(),
      subscribe,
    );

    expect(store().getSnapshot()).toBeUndefined();
    expect(targets).toEqual([]);
    expect(readActiveRunMarker(STORAGE_KEY)).toBeUndefined();
    // The cached transcript may be stale (fetched mid-flight); refetch it so the
    // final assistant message shows instead of just the user's prompt.
    expect(refreshedHistoryFor).toEqual([CONVERSATION_ID]);
  });

  it("does nothing when no marker is present", async () => {
    const { targets, subscribe } = captureSubscribe();

    await resumeRunFromMarker(context(fakeClient()), store(), subscribe);

    expect(store().getSnapshot()).toBeUndefined();
    expect(targets).toEqual([]);
  });
});
