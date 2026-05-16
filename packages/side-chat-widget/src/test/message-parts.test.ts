import { describe, expect, it } from "vitest";
import {
  appendReasoningPart,
  upsertHostCommandPart,
  upsertToolPart,
  type WidgetMessagePart,
} from "../hooks/use-side-chat.js";
import {
  applySideChatStreamEventToMessages,
  completeHostCommandPartInMessages,
  getSideChatStreamEventEffect,
  type WidgetMessage,
} from "../hooks/use-side-chat-events.js";

describe("assistant message parts", () => {
  it("keeps resumed reasoning separate when a tool call interrupts it", () => {
    let parts: WidgetMessagePart[] = [];

    parts = appendReasoningPart(parts, "First thought. ", 0);
    parts = upsertToolPart(parts, {
      id: "tool-call-1",
      type: "tool",
      toolCallId: "call-1",
      toolName: "workbench_query",
      status: "running",
    });
    parts = appendReasoningPart(parts, "Second thought.", 2);
    parts = upsertToolPart(parts, {
      id: "tool-call-1",
      type: "tool",
      toolCallId: "call-1",
      toolName: "workbench_query",
      status: "completed",
      output: { rows: 3 },
    });

    expect(parts).toMatchObject([
      { type: "reasoning", content: "First thought. " },
      { type: "tool", toolCallId: "call-1", status: "completed" },
      { type: "reasoning", content: "Second thought." },
    ]);
  });

  it("updates host command status without duplicating the command part", () => {
    let parts: WidgetMessagePart[] = [];

    parts = upsertHostCommandPart(parts, {
      id: "host-command-1",
      type: "host-command",
      commandId: "command-1",
      command: { type: "ui.focusResource", resourceId: "rows" },
      status: "pending",
    });
    parts = upsertHostCommandPart(parts, {
      id: "host-command-1",
      type: "host-command",
      commandId: "command-1",
      command: { type: "ui.focusResource", resourceId: "rows" },
      status: "applied",
      result: { status: "applied" },
    });

    expect(parts).toMatchObject([
      {
        type: "host-command",
        commandId: "command-1",
        status: "applied",
      },
    ]);
  });

  it("projects assistant stream events into widget messages", () => {
    const started = applySideChatStreamEventToMessages([], {
      type: "sidechat.started",
      requestId: "req-1",
      conversationId: "conv-1",
      messageId: "assistant-1",
      model: { provider: "openai", id: "gpt-4.1-mini" },
    });
    const withDelta = applySideChatStreamEventToMessages(started, {
      type: "sidechat.delta",
      requestId: "req-1",
      messageId: "assistant-1",
      content: "Review ",
      index: 0,
    });
    const withReasoning = applySideChatStreamEventToMessages(withDelta, {
      type: "sidechat.reasoning",
      requestId: "req-1",
      messageId: "assistant-1",
      content: "Checking worklist. ",
      index: 1,
    });
    const withTool = applySideChatStreamEventToMessages(withReasoning, {
      type: "sidechat.tool",
      requestId: "req-1",
      messageId: "assistant-1",
      toolCallId: "tool-1",
      toolName: "workbench_query",
      status: "running",
      input: { resourceId: "advisoryWorklist" },
      index: 2,
    });
    const completed = applySideChatStreamEventToMessages(withTool, {
      type: "sidechat.completed",
      requestId: "req-1",
      conversationId: "conv-1",
      messageId: "assistant-1",
      model: { provider: "openai", id: "gpt-4.1-mini" },
      finishReason: "stop",
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      metadata: {
        citations: [
          {
            sourceId: "advisoryWorklist:row-1",
            label: "Worklist row",
            dataset: "client_portfolio_review",
          },
        ],
      },
    });

    expect(completed).toMatchObject([
      {
        id: "assistant-1",
        role: "assistant",
        content: "Review ",
        parts: [
          { type: "reasoning", content: "Checking worklist. " },
          {
            type: "tool",
            toolCallId: "tool-1",
            status: "running",
            input: { resourceId: "advisoryWorklist" },
          },
        ],
        metadata: {
          citations: [{ sourceId: "advisoryWorklist:row-1" }],
        },
      },
    ]);
  });

  it("separates host command projection from host command dispatch effects", () => {
    const messages: WidgetMessage[] = [
      { id: "assistant-1", role: "assistant", content: "" },
    ];
    const event = {
      type: "sidechat.host_command" as const,
      requestId: "req-1",
      messageId: "assistant-1",
      commandId: "command-1",
      command: { type: "ui.focusResource" as const, resourceId: "clientCard" },
      index: 0,
    };

    const projected = applySideChatStreamEventToMessages(messages, event);
    const effect = getSideChatStreamEventEffect(event);

    expect(projected[0]?.parts).toMatchObject([
      {
        type: "host-command",
        commandId: "command-1",
        status: "pending",
      },
    ]);
    expect(effect).toMatchObject({
      kind: "host-command",
      messageId: "assistant-1",
      command: { type: "ui.focusResource", resourceId: "clientCard" },
    });

    const completed = completeHostCommandPartInMessages(
      projected,
      "assistant-1",
      {
        id: "host-command-command-1",
        type: "host-command",
        commandId: "command-1",
        command: { type: "ui.focusResource", resourceId: "clientCard" },
        status: "applied",
        result: { status: "applied" },
      },
    );

    expect(completed[0]?.parts).toMatchObject([
      {
        type: "host-command",
        commandId: "command-1",
        status: "applied",
        result: { status: "applied" },
      },
    ]);
  });

  it("projects history events and keeps error events as side effects only", () => {
    const current: WidgetMessage[] = [
      { id: "assistant-1", role: "assistant", content: "Keep me only until history arrives." },
    ];
    const history = applySideChatStreamEventToMessages(current, {
      type: "sidechat.history",
      requestId: "req-1",
      conversationId: "conv-1",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "previous question",
          metadata: { source: "seed" },
        },
      ],
    });
    const error = {
      type: "sidechat.error" as const,
      requestId: "req-1",
      code: "MODEL_UNAVAILABLE",
      message: "Model unavailable",
      retryable: true,
    };

    expect(history).toEqual([
      {
        id: "user-1",
        role: "user",
        content: "previous question",
        metadata: { source: "seed" },
      },
    ]);
    expect(applySideChatStreamEventToMessages(history, error)).toBe(history);
    expect(getSideChatStreamEventEffect(error)).toEqual({
      kind: "error",
      error,
    });
  });
});
