import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type HostCommandEvent,
  type ToolEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import {
  createDefaultRequest,
  createWidgetMessage,
  toErrorMessage,
  updateHostCommand,
  updateMessage,
  upsertToolEvent,
  type HostCommandView,
  type WidgetMessage,
} from "./widget-chat.js";

describe("widget-state", () => {
  it("creates protocol requests with optional profile and host context", () => {
    const request = createDefaultRequest({
      assistantProfileId: "gpt-5.4-mini",
      content: "hello",
      hostContext: {
        schemaVersion: "widget-harness.host-context.v1",
        title: "Portfolio",
      },
      messageId: "message_001",
      requestId: "request_001",
    });

    expect(request).toEqual({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "request_001",
      assistantProfileId: "gpt-5.4-mini",
      message: {
        id: "message_001",
        role: "user",
        content: "hello",
      },
      hostContext: {
        schemaVersion: "widget-harness.host-context.v1",
        title: "Portfolio",
      },
    });
  });

  it("omits optional request fields when they are unavailable", () => {
    const request = createDefaultRequest({
      assistantProfileId: undefined,
      content: "hello",
      hostContext: undefined,
      messageId: "message_001",
      requestId: "request_001",
    });

    expect(request).toEqual({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      requestId: "request_001",
      message: {
        id: "message_001",
        role: "user",
        content: "hello",
      },
    });
  });

  it("initializes widget messages with empty assistant detail collections", () => {
    expect(createWidgetMessage("assistant_001", "assistant", "", true)).toEqual({
      id: "assistant_001",
      role: "assistant",
      content: "",
      thoughts: [],
      reasoning: [],
      tools: [],
      hostCommands: [],
      isStreaming: true,
    });
  });

  it("updates only the matching message", () => {
    const messages = [
      createWidgetMessage("user_001", "user", "hello"),
      createWidgetMessage("assistant_001", "assistant", ""),
    ];

    const updated = updateMessage(messages, "assistant_001", (message) => ({
      ...message,
      content: "done",
    }));

    expect(updated).toEqual([
      messages[0],
      {
        ...messages[1],
        content: "done",
      },
    ]);
    expect(updated).not.toBe(messages);
  });

  it("merges tool updates while preserving earlier input", () => {
    const started = createToolEvent({
      input: { query: "search web" },
      status: "started",
    });
    const completed = createToolEvent({
      result: { summary: "found context" },
      status: "completed",
    });

    expect(upsertToolEvent([started], completed)).toEqual([
      {
        ...started,
        status: "completed",
        result: { summary: "found context" },
      },
    ]);
  });

  it("updates host command status by command id", () => {
    const event = createHostCommandEvent();
    const messages: WidgetMessage[] = [
      {
        ...createWidgetMessage("assistant_001", "assistant", ""),
        hostCommands: [{ event, status: "running" }],
      },
    ];
    const completed: HostCommandView = {
      event,
      status: "completed",
      result: {
        commandId: event.commandId,
        commandName: event.commandName,
        resolvedAt: "2026-05-25T00:00:01.000Z",
        resultCode: "applied",
        status: "applied",
      },
    };

    expect(updateHostCommand(messages, "assistant_001", event.commandId, completed)).toEqual([
      {
        ...messages[0],
        hostCommands: [completed],
      },
    ]);
  });

  it("maps unknown errors for UI display", () => {
    expect(toErrorMessage(new Error("nope"))).toBe("nope");
    expect(toErrorMessage("nope")).toBe("Chat request failed");
  });
});

const createToolEvent = (
  overrides: Pick<ToolEvent, "status"> & Partial<Pick<ToolEvent, "input" | "result">>,
): ToolEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: SIDECHAT_EVENT_TYPES.TOOL,
  eventId: "event_tool_001",
  assistantTurnId: "turn_001",
  sequence: 3,
  createdAt: "2026-05-25T00:00:00.000Z",
  toolCallId: "tool_call_001",
  toolName: "mock_web_search",
  ...overrides,
});

const createHostCommandEvent = (): HostCommandEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: SIDECHAT_EVENT_TYPES.HOST_COMMAND,
  eventId: "event_command_001",
  assistantTurnId: "turn_001",
  sequence: 4,
  createdAt: "2026-05-25T00:00:00.000Z",
  commandId: "command_001",
  commandName: "open_resource",
  payload: { resourceId: "client_001" },
});
