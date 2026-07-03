import {
  SIDECHAT_PROTOCOL_VERSION,
  type ActivityEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import type { HostCommandActivityEvent, HostCommandResult } from "@side-chat/host-bridge";
import { afterEach, describe, expect, it } from "vitest";

import { createWidgetMessage } from "#entities/chat";
import type { SideChatApiClient } from "#entities/conversation";
import {
  getWidgetRunStore,
  resetWidgetRunStores,
  type WidgetRunStore,
} from "../run/widget-run-store.js";
import { runSubscription } from "./widget-run-subscription.js";

const REQUEST_ID = "req-1";
const TURN_ID = "turn-1";

afterEach(() => {
  resetWidgetRunStores();
});

const startStore = (): WidgetRunStore => {
  const store = getWidgetRunStore({ storageKey: "subscription-test", baseUrl: undefined });
  store.start({
    requestId: REQUEST_ID,
    localUserMessageId: "user-1",
    localAssistantMessageId: "assistant-1",
    messages: [createWidgetMessage("assistant-1", "assistant", "", true)],
  });
  return store;
};

const started: StartedEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: "evt-0",
  assistantTurnId: TURN_ID,
  sequence: 0,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
};

const hostCommand = (overrides: Partial<ActivityEvent> = {}): ActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.activity",
  eventId: "evt-1",
  assistantTurnId: TURN_ID,
  sequence: 1,
  createdAt: "2026-05-23T00:00:01.000Z",
  activityId: "command-open-resource",
  activityKind: "host_command",
  status: "running",
  title: "Open support ticket",
  details: {
    hostCommand: {
      commandId: "command-open-resource",
      commandName: "open_resource",
      payload: { resourceType: "ticket", resourceId: "ticket-1" },
    },
  },
  ...overrides,
});

const asyncIterableOf = (
  events: readonly SidechatStreamEvent[],
): AsyncIterable<SidechatStreamEvent> => ({
  async *[Symbol.asyncIterator]() {
    for (const event of events) yield event;
  },
});

const fakeClient = (): SideChatApiClient => ({
  createRun: () => Promise.reject(new Error("createRun is not used with a pre-acquired stream")),
  subscribeTurn: () =>
    Promise.reject(new Error("subscribeTurn is not used with a pre-acquired stream")),
  resolveRun: () => Promise.resolve({ assistantTurnId: TURN_ID, status: "running" }),
  cancelTurn: (assistantTurnId) => Promise.resolve({ assistantTurnId, cancelRequested: true }),
  getTurnStatus: () =>
    Promise.resolve({
      assistantTurnId: TURN_ID,
      conversationId: "conversation-1",
      requestId: REQUEST_ID,
      status: "running",
    }),
  readHistory: () => Promise.resolve({ conversationId: "conversation-1", messages: [] }),
});

const dispatchTracking = (): {
  readonly dispatched: HostCommandActivityEvent[];
  readonly hostBridge: {
    readonly dispatchCommand: (event: HostCommandActivityEvent) => Promise<HostCommandResult>;
  };
} => {
  const dispatched: HostCommandActivityEvent[] = [];
  return {
    dispatched,
    hostBridge: {
      dispatchCommand: (event) => {
        dispatched.push(event);
        return Promise.resolve({
          commandId: event.details.hostCommand.commandId,
          commandName: event.details.hostCommand.commandName,
          status: "applied",
          resultCode: "ok",
          resolvedAt: "2026-05-23T00:00:02.000Z",
        });
      },
    },
  };
};

const drive = async (
  events: readonly SidechatStreamEvent[],
): Promise<HostCommandActivityEvent[]> => {
  const store = startStore();
  const { dispatched, hostBridge } = dispatchTracking();
  await runSubscription({
    client: fakeClient(),
    store,
    hostBridge,
    requestId: REQUEST_ID,
    assistantTurnId: TURN_ID,
    events: asyncIterableOf(events),
    signal: new AbortController().signal,
  });
  return dispatched;
};

describe("host command dispatch guard", () => {
  it("dispatches a live running host command with no result", async () => {
    const dispatched = await drive([started, hostCommand()]);

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.details.hostCommand.commandName).toBe("open_resource");
  });

  it("does not re-dispatch a replayed host command that already carries a result", async () => {
    const dispatched = await drive([
      started,
      hostCommand({
        status: "completed",
        details: {
          hostCommand: {
            commandId: "command-open-resource",
            commandName: "open_resource",
            payload: { resourceType: "ticket", resourceId: "ticket-1" },
            result: { status: "applied" },
          },
        },
      }),
    ]);

    expect(dispatched).toHaveLength(0);
  });

  it("does not dispatch a host command replayed with a non-running status", async () => {
    const dispatched = await drive([started, hostCommand({ status: "completed" })]);

    expect(dispatched).toHaveLength(0);
  });
});
