import {
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import { SideChatApiError, type SideChatApiClient } from "#entities/conversation";
import {
  getWidgetRunStore,
  resetWidgetRunStores,
  type WidgetRunStore,
} from "../../run/widget-run-store.js";
import { WIDGET_RUN_STATUSES } from "../../run/widget-run-state.js";
import { consumeTurnStreamWithRecovery } from "./widget-transport-recovery.js";

const REQUEST_ID = "request-1";
const TURN_ID = "turn-1";
const ASSISTANT_ID = "assistant-1";

afterEach(() => {
  resetWidgetRunStores();
});

const startStore = (): WidgetRunStore => {
  const store = getWidgetRunStore({ storageKey: "recovery-test", baseUrl: undefined });
  store.start({
    requestId: REQUEST_ID,
    assistantTurnId: TURN_ID,
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
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-07-02T00:00:00.000Z",
  conversationId: "conversation-1",
});

const delta = (sequence: number, content: string): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-07-02T00:00:01.000Z",
  content,
});

const completed = (sequence: number): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: `evt-${sequence}`,
  assistantTurnId: TURN_ID,
  sequence,
  createdAt: "2026-07-02T00:00:02.000Z",
  finishReason: "stop",
  usage: { totalTokens: 7 },
});

/** One scripted subscribe attempt: yield these events, then optionally throw. */
type ScriptedAttempt = {
  readonly events: readonly SidechatStreamEvent[];
  readonly thenThrow?: SideChatApiError | undefined;
  /** Never yield or end — a zombie connection the watchdog must cut. */
  readonly wedge?: boolean | undefined;
};

const scriptedEvents = async function* (
  attempt: ScriptedAttempt,
  signal: AbortSignal,
): AsyncIterable<SidechatStreamEvent> {
  await Promise.resolve();
  yield* attempt.events;
  if (attempt.wedge) {
    await new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () =>
        reject(new SideChatApiError("aborted", "stream aborted", { cause: signal.reason })),
      );
    });
  }
  if (attempt.thenThrow) throw attempt.thenThrow;
};

type Harness = {
  readonly client: SideChatApiClient;
  readonly subscribeAfters: number[];
  readonly statusPolls: number[];
};

const buildClient = (
  attempts: readonly ScriptedAttempt[],
  serverStatuses: readonly string[] = [],
): Harness => {
  const subscribeAfters: number[] = [];
  const statusPolls: number[] = [];
  const client: SideChatApiClient = {
    createRun: () => Promise.reject(new Error("createRun is not used by recovery")),
    subscribeTurn: (_turnId, options = {}) => {
      const attempt = attempts[subscribeAfters.length];
      subscribeAfters.push(options.after ?? -1);
      if (!attempt) {
        return Promise.reject(new SideChatApiError("network_error", "no scripted attempt left"));
      }
      return Promise.resolve({ events: scriptedEvents(attempt, options.signal ?? neverAborted) });
    },
    resolveRun: () => Promise.reject(new Error("resolveRun is not used by recovery")),
    getTurnStatus: () => {
      const status = serverStatuses[Math.min(statusPolls.length, serverStatuses.length - 1)];
      statusPolls.push(statusPolls.length);
      if (!status) return Promise.reject(new SideChatApiError("network_error", "status poll down"));
      return Promise.resolve({
        assistantTurnId: TURN_ID,
        conversationId: "conversation-1",
        requestId: REQUEST_ID,
        status,
      });
    },
    cancelTurn: (assistantTurnId) => Promise.resolve({ assistantTurnId, cancelRequested: true }),
  };
  return { client, subscribeAfters, statusPolls };
};

const neverAborted = new AbortController().signal;

const runRecovery = (
  harness: Harness,
  store: WidgetRunStore,
  overrides: {
    readonly signal?: AbortSignal;
    readonly inactivityTimeoutMs?: number;
    readonly onReplayExpired?: () => void;
    readonly onServerTerminal?: () => void;
  } = {},
): Promise<void> =>
  consumeTurnStreamWithRecovery({
    client: harness.client,
    store,
    hostBridge: undefined,
    requestId: REQUEST_ID,
    assistantTurnId: TURN_ID,
    signal: overrides.signal ?? neverAborted,
    inactivityTimeoutMs: overrides.inactivityTimeoutMs ?? 5_000,
    retryBackoffMs: [5, 5, 5, 5],
    pollIntervalMs: 5,
    onReplayExpired: overrides.onReplayExpired ?? (() => undefined),
    onServerTerminal: overrides.onServerTerminal ?? (() => undefined),
  });

const dropped = (): SideChatApiError =>
  new SideChatApiError("missing_terminal", "SSE stream ended before a terminal event");

describe("consumeTurnStreamWithRecovery", () => {
  it("resumes a dropped stream from the cursor with zero duplicate deltas", async () => {
    // The connection drops after delta 1; the retry must resume after=1 and the
    // replayed overlap (the fake re-sends delta 1) must not double-apply.
    const harness = buildClient([
      { events: [started(0), delta(1, "Hel")], thenThrow: dropped() },
      { events: [delta(1, "Hel"), delta(2, "lo"), completed(3)] },
    ]);
    const store = startStore();

    await runRecovery(harness, store);

    const run = store.getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(run?.lastSeenSequence).toBe(3);
    expect(harness.subscribeAfters).toEqual([-1, 1]);
    const assistant = run?.messages.find((message) => message.id === ASSISTANT_ID);
    expect(assistant?.content).toBe("Hello");
  });

  it("degrades to status polling when retries exhaust, and takes the server's terminal", async () => {
    // Every subscribe attempt drops immediately; the server eventually reports
    // completed — only ITS verdict ends the run, not a local fake-FAILED.
    const alwaysDropping = Array.from({ length: 8 }, () => ({
      events: [] as readonly SidechatStreamEvent[],
      thenThrow: dropped(),
    }));
    const harness = buildClient(alwaysDropping, ["running", "completed"]);
    const store = startStore();
    let markerCleared = 0;

    await runRecovery(harness, store, {
      onServerTerminal: () => {
        markerCleared += 1;
      },
    });

    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(markerCleared).toBe(1);
    expect(harness.subscribeAfters.length).toBeGreaterThanOrEqual(4);
  });

  it("goes straight to polling on stream_unavailable (another instance owns the stream)", async () => {
    const harness = buildClient(
      [
        {
          events: [],
          thenThrow: new SideChatApiError("stream_unavailable", "not the owner", { status: 409 }),
        },
      ],
      ["user_aborted"],
    );
    const store = startStore();

    await runRecovery(harness, store);

    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.CANCELLED);
    expect(harness.subscribeAfters).toEqual([-1]);
  });

  it("fails the run only on a fatal error (protocol violation), without retrying", async () => {
    const harness = buildClient([
      {
        events: [started(0)],
        thenThrow: new SideChatApiError("malformed_stream", "sequence went backwards"),
      },
    ]);
    const store = startStore();

    await runRecovery(harness, store);

    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.FAILED);
    expect(harness.subscribeAfters).toEqual([-1]);
  });

  it("cuts a wedged connection via the watchdog and resumes it", async () => {
    // The first attempt yields one event and then goes silent forever; the
    // watchdog must abort it so the composer is never locked forever.
    const harness = buildClient([
      { events: [started(0), delta(1, "Hel")], wedge: true },
      { events: [delta(2, "lo"), completed(3)] },
    ]);
    const store = startStore();

    await runRecovery(harness, store, { inactivityTimeoutMs: 20 });

    const run = store.getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.COMPLETED);
    expect(harness.subscribeAfters).toEqual([-1, 1]);
  });

  it("stops silently when the caller aborts mid-recovery (cancel/clear)", async () => {
    const controller = new AbortController();
    const harness = buildClient([{ events: [started(0)], thenThrow: dropped() }]);
    const store = startStore();

    const recovery = runRecovery(harness, store, { signal: controller.signal });
    controller.abort();
    await recovery;

    // No local failure was fabricated; the run stays as the caller left it.
    expect(store.getSnapshot()?.status).not.toBe(WIDGET_RUN_STATUSES.FAILED);
  });

  it("stops retrying once the run settles underneath it (cancel acked elsewhere)", async () => {
    const harness = buildClient([{ events: [started(0)], thenThrow: dropped() }]);
    const store = startStore();

    const recovery = runRecovery(harness, store);
    store.dispatch(REQUEST_ID, { type: "terminal", status: WIDGET_RUN_STATUSES.CANCELLED });
    await recovery;

    expect(store.getSnapshot()?.status).toBe(WIDGET_RUN_STATUSES.CANCELLED);
    expect(harness.subscribeAfters.length).toBeLessThanOrEqual(1);
  });

  it("fails the run when status polling itself fails persistently", async () => {
    const harness = buildClient(
      [
        {
          events: [],
          thenThrow: new SideChatApiError("stream_unavailable", "not the owner", { status: 409 }),
        },
      ],
      [], // every poll rejects
    );
    const store = startStore();

    await runRecovery(harness, store);

    const run = store.getSnapshot();
    expect(run?.status).toBe(WIDGET_RUN_STATUSES.FAILED);
    expect(run?.errorMessage).toContain("Connection");
  });
});
