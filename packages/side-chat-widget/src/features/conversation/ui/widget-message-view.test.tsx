import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  type HostCommandEvent,
  type ToolEvent,
} from "@side-chat/chat-protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetMessageView } from "./widget-message-view.js";
import type { WidgetMessage } from "#entities/chat";

describe("WidgetMessageView", () => {
  it("renders assistant content, reasoning, and a collapsed tool summary", () => {
    const message: WidgetMessage = {
      id: "assistant_001",
      role: "assistant",
      content: "Here is the answer.",
      thoughts: [],
      reasoning: ["checked portfolio context"],
      tools: [
        createToolEvent({
          status: "completed",
          input: { query: "search web" },
          result: { summary: "found context" },
        }),
      ],
      hostCommands: [],
      isStreaming: true,
    };

    const html = renderToStaticMarkup(<WidgetMessageView message={message} />);

    expect(html).toContain("Here is the answer.");
    expect(html).toContain("checked portfolio context");
    expect(html).toContain("mock_web_search");
    expect(html).not.toContain("Parameters");
    expect(html).not.toContain("Result");
    expect(html).not.toContain("found context");
  });

  it("keeps tool thoughts in stream order instead of grouping them last", () => {
    const tool = createToolEvent({
      status: "completed",
      input: { query: "search web" },
      result: { summary: "found context" },
    });
    const message: WidgetMessage = {
      id: "assistant_001",
      role: "assistant",
      content: "Here is the answer.",
      thoughts: [
        {
          content: "before tool",
          id: "reasoning_001",
          kind: "reasoning",
          sequence: 1,
        },
        {
          id: tool.toolCallId,
          kind: "tool",
          sequence: 2,
          tool,
        },
        {
          content: "after tool",
          id: "reasoning_002",
          kind: "reasoning",
          sequence: 3,
        },
      ],
      reasoning: [],
      tools: [tool],
      hostCommands: [],
      isStreaming: false,
    };

    const html = renderToStaticMarkup(<WidgetMessageView message={message} />);

    expect(html.indexOf("before tool")).toBeLessThan(html.indexOf("mock_web_search"));
    expect(html.indexOf("mock_web_search")).toBeLessThan(html.indexOf("after tool"));
  });

  it("renders a streaming placeholder when no assistant text is available", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={{
          id: "assistant_001",
          role: "assistant",
          content: "",
          thoughts: [],
          reasoning: [],
          tools: [],
          hostCommands: [],
          isStreaming: true,
        }}
      />,
    );

    expect(html).toContain("Thinking...");
  });

  it("renders failed host commands as tool-style output", () => {
    const event = createHostCommandEvent();
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={{
          id: "assistant_001",
          role: "assistant",
          content: "",
          thoughts: [],
          reasoning: [],
          tools: [],
          hostCommands: [{ event, status: "failed" }],
        }}
      />,
    );

    expect(html).toContain("open_resource");
    expect(html).toContain("Error");
    expect(html).toContain("open_resource: failed");
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
