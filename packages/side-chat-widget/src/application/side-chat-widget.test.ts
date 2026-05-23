import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type ErrorEvent,
  type HistoryEvent,
  type HostCommandEvent,
  type ReasoningEvent,
  type SidechatStreamEvent,
  type StartedEvent,
  type ToolEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import {
  Composer,
  submitComposerMessage,
} from "../domain/composer/composer.js";
import { SideChatWidget, runChatStream } from "./side-chat-widget.js";
import {
  initialWidgetState,
  sideChatReducer,
  type WidgetAction,
} from "../domain/message/state.js";

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: {
    id: "message-1",
    role: "user",
    content: "hello",
  },
};

const started: StartedEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: "event-0",
  assistantTurnId: "turn-1",
  sequence: 0,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
};

const delta: DeltaEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: "event-1",
  assistantTurnId: "turn-1",
  sequence: 1,
  createdAt: "2026-05-23T00:00:01.000Z",
  content: "answer",
};

const reasoning: ReasoningEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.reasoning",
  eventId: "event-2",
  assistantTurnId: "turn-1",
  sequence: 2,
  createdAt: "2026-05-23T00:00:02.000Z",
  summary: "thinking",
};

const tool: ToolEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.tool",
  eventId: "event-3",
  assistantTurnId: "turn-1",
  sequence: 3,
  createdAt: "2026-05-23T00:00:03.000Z",
  toolCallId: "tool-1",
  toolName: "lookup",
  status: "completed",
};

const hostCommand: HostCommandEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.host_command",
  eventId: "event-4",
  assistantTurnId: "turn-1",
  sequence: 4,
  createdAt: "2026-05-23T00:00:04.000Z",
  commandId: "command-1",
  commandName: "open_resource",
  payload: { resourceType: "document", resourceId: "doc-1" },
};

const completed: CompletedEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: "event-5",
  assistantTurnId: "turn-1",
  sequence: 5,
  createdAt: "2026-05-23T00:00:05.000Z",
  finishReason: "stop",
};

const errorEvent: ErrorEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.error",
  eventId: "event-error",
  assistantTurnId: "turn-2",
  sequence: 6,
  createdAt: "2026-05-23T00:00:06.000Z",
  code: "provider_failed",
  message: "provider failed",
  retryable: true,
};

const history: HistoryEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.history",
  eventId: "event-history",
  assistantTurnId: "turn-1",
  sequence: 7,
  createdAt: "2026-05-23T00:00:07.000Z",
  messages: [
    { id: "history-1", role: "user", content: "past", sequence: 0 },
    { id: "history-2", role: "assistant", content: "reply", sequence: 1 },
  ],
};

const toEvents = async function* (
  events: readonly SidechatStreamEvent[],
): AsyncIterable<SidechatStreamEvent> {
  for (const event of events) {
    await Promise.resolve();
    yield event;
  }
};

describe("sideChatReducer", () => {
  it("projects protocol stream events into widget state", () => {
    const state = [
      started,
      delta,
      reasoning,
      tool,
      hostCommand,
      completed,
    ].reduce(
      (current, event) =>
        sideChatReducer(current, { type: "stream_event", event }),
      sideChatReducer(initialWidgetState, { type: "submit", request }),
    );

    expect(state).toMatchObject({
      status: "completed",
      conversationId: "conversation-1",
      assistantTurnId: "turn-1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "answer" },
      ],
      reasoning: ["thinking"],
      tools: [{ toolName: "lookup", status: "completed" }],
      hostCommands: [{ event: { commandId: "command-1" } }],
    });
  });

  it("projects error and history events", () => {
    const withError = sideChatReducer(initialWidgetState, {
      type: "stream_event",
      event: errorEvent,
    });
    const withHistory = sideChatReducer(initialWidgetState, {
      type: "stream_event",
      event: history,
    });

    expect(withError).toMatchObject({
      status: "error",
      errorMessage: "provider failed",
    });
    expect(withHistory.messages).toEqual([
      { id: "history-1", role: "user", content: "past", sequence: 0 },
      { id: "history-2", role: "assistant", content: "reply", sequence: 1 },
    ]);
  });

  it("records local host command results without durable backend assumptions", () => {
    const pending = sideChatReducer(initialWidgetState, {
      type: "stream_event",
      event: hostCommand,
    });
    const resolved = sideChatReducer(pending, {
      type: "host_command_result",
      result: {
        commandId: "command-1",
        commandName: "open_resource",
        status: "applied",
        resultCode: "opened",
        resolvedAt: "2026-05-23T00:00:08.000Z",
      },
    });

    expect(resolved.hostCommands).toHaveLength(1);
    expect(resolved.hostCommands[0]?.event).toBe(hostCommand);
    expect(resolved.hostCommands[0]?.result).toMatchObject({
      status: "applied",
      resultCode: "opened",
    });
  });
});

describe("SideChatWidget components", () => {
  it("renders shell, feed, error state, and disabled composer state", () => {
    const client = {
      streamChat: () => Promise.resolve({ events: toEvents([]), attempt: 1 }),
    };
    const state = {
      ...initialWidgetState,
      status: "streaming" as const,
      errorMessage: "shown error",
      messages: [
        { id: "m1", role: "assistant" as const, content: "hello", sequence: 0 },
      ],
    };

    const html = renderToStaticMarkup(
      createElement(SideChatWidget, {
        client,
        initialState: state,
        labels: { title: "Assistant" },
      }),
    );

    expect(html).toContain("Assistant");
    expect(html).toContain('data-status="streaming"');
    expect(html).toContain("hello");
    expect(html).toContain("disabled");
  });

  it("submits composer text only when enabled", () => {
    const submitted: string[] = [];

    expect(
      submitComposerMessage("  hello  ", false, (message) =>
        submitted.push(message),
      ),
    ).toBe(true);
    expect(
      submitComposerMessage("blocked", true, (message) =>
        submitted.push(message),
      ),
    ).toBe(false);
    expect(
      submitComposerMessage("   ", false, (message) => submitted.push(message)),
    ).toBe(false);
    expect(submitted).toEqual(["hello"]);

    const html = renderToStaticMarkup(
      createElement(Composer, {
        disabled: false,
        onSubmit: (message) => {
          submitted.push(message);
        },
      }),
    );
    expect(html).toContain("side-chat-composer");
  });

  it("streams events and dispatches host commands through the host bridge", async () => {
    const actions: WidgetAction[] = [];
    const client = {
      streamChat: () =>
        Promise.resolve({
          events: toEvents([started, hostCommand, completed]),
          attempt: 1,
        }),
    };
    const hostBridge = {
      getContext: () =>
        Promise.resolve({
          schemaVersion: "host-context.v1",
          title: "Host",
        }),
      dispatchCommand: () =>
        Promise.resolve({
          commandId: "command-1",
          commandName: "open_resource",
          status: "applied" as const,
          resultCode: "opened",
          resolvedAt: "2026-05-23T00:00:08.000Z",
        }),
    };

    await runChatStream({
      client,
      dispatch: (action) => {
        actions.push(action);
      },
      hostBridge,
      message: "hello",
      requestFactory: (message, hostContext) => ({
        ...request,
        message: { ...request.message, content: message },
        ...(hostContext ? { hostContext } : {}),
      }),
    });
    await Promise.resolve();

    const actionTypes = actions.map((action) => action.type);
    expect(actionTypes[0]).toBe("submit");
    expect(actionTypes.filter((type) => type === "stream_event")).toHaveLength(
      3,
    );
    expect(actionTypes).toContain("host_command_result");
    expect(actions[0]).toMatchObject({
      request: { hostContext: { title: "Host" } },
    });
  });
});
