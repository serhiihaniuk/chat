import { SIDECHAT_PROTOCOL_VERSION, type ActivityEvent } from "@side-chat/chat-protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  applyActivityEvent,
  type WidgetActivityTimeline,
  type WidgetMessage,
} from "#entities/chat";
import { WidgetMessageView } from "./widget-message-view.js";

describe("WidgetMessageView", () => {
  it("renders assistant content and the reasoning timeline with compact tool rows", () => {
    const message = createAssistantMessage({
      content: "Here is the answer.",
      isStreaming: true,
      activityEvents: [
        createActivity({
          activityId: "reasoning_001",
          activityKind: "reasoning",
          sequence: 1,
          title: "Checked portfolio context",
        }),
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 2,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              input: { query: "search web" },
              result: { summary: "found context" },
            },
          },
        }),
      ],
    });

    // Detailed exposure expands the reasoning trace; a tool that carries
    // input/result renders as the expandable detail row, collapsed by default.
    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" />,
    );

    expect(html).toContain("Here is the answer.");
    expect(html).toContain("Checked portfolio context");
    expect(html).toContain("Mock web search");
    expect(html).toContain('data-slot="tool-detail-row"');
    expect(html).toContain('data-state="success"');
    // Collapsed by default: the result payload discloses on expand only.
    expect(html).not.toContain("found context");
  });

  it("renders activity rows in canonical stream order", () => {
    const message = createAssistantMessage({
      isStreaming: true,
      activityEvents: [
        createActivity({
          activityId: "progress_001",
          activityKind: "progress",
          sequence: 1,
          title: "Searching the web",
        }),
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 2,
          title: "Run mock_web_search",
          details: {
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              input: { query: "search web" },
            },
          },
        }),
        createActivity({
          activityId: "reasoning_002",
          activityKind: "reasoning",
          sequence: 3,
          title: "Prepared final answer",
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" />,
    );

    expect(html.indexOf("Searching the web")).toBeLessThan(html.indexOf("Mock web search"));
    expect(html.indexOf("Mock web search")).toBeLessThan(html.indexOf("Prepared final answer"));
  });

  it("renders final assistant markdown through the message response renderer", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Common causes include:\n\n- Too much debt\n- Asset bubbles",
        })}
        reasoningVisibility="minimal"
      />,
    );

    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain("Too much debt");
    expect(html).toContain("Asset bubbles");
  });

  it("renders the live reasoning fold before activity events arrive", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={{
          id: "assistant_001",
          role: "assistant",
          content: "",
          activity: { items: [] },
          isStreaming: true,
        }}
        reasoningVisibility="minimal"
      />,
    );

    expect(html).toContain("Thinking");
    expect(html).toContain("Preparing the response.");
    expect(html).toContain("rotate-180");
  });

  it("opens live activity after the stream emits a trace", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          isStreaming: true,
          activityEvents: [
            createActivity({
              activityId: "reasoning_001",
              activityKind: "reasoning",
              sequence: 1,
              title: "Checking context",
            }),
          ],
        })}
        reasoningVisibility="minimal"
      />,
    );

    expect(html).toContain("Thinking...");
    expect(html).toContain("Checking context");
    expect(html).toContain("rotate-180");
  });

  it("opens live tool activity even with minimal reasoning visibility", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          isStreaming: true,
          activityEvents: [
            createActivity({
              activityId: "tool_call_001",
              activityKind: "tool",
              sequence: 1,
              title: "Run mock_web_search",
              details: {
                tool: {
                  toolCallId: "tool_call_001",
                  toolName: "mock_web_search",
                  input: { query: "search web" },
                },
              },
            }),
          ],
        })}
        reasoningVisibility="minimal"
      />,
    );

    expect(html).toContain("Thinking...");
    expect(html).toContain("Mock web search");
    expect(html).toContain("rotate-180");
  });

  it("keeps completed minimal reasoning collapsed by default", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Done.",
          activityEvents: [
            createActivity({
              activityId: "reasoning_001",
              activityKind: "reasoning",
              sequence: 1,
              title: "Checked context",
            }),
          ],
        })}
        reasoningVisibility="minimal"
      />,
    );

    expect(html).toContain("Thought process");
    expect(html).not.toContain("rotate-180");
  });

  it("keeps completed detailed reasoning expanded by default", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Done.",
          activityEvents: [
            createActivity({
              activityId: "reasoning_001",
              activityKind: "reasoning",
              sequence: 1,
              title: "Checked context",
            }),
          ],
        })}
        reasoningVisibility="detailed"
      />,
    );

    expect(html).toContain("Thought process");
    expect(html).toContain("rotate-180");
  });

  it("renders failed host commands as compact error tool rows", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          isStreaming: true,
          activityEvents: [
            createActivity({
              activityId: "reasoning_001",
              activityKind: "reasoning",
              sequence: 1,
              title: "Checking host context",
            }),
            createActivity({
              activityId: "command_001",
              activityKind: "host_command",
              sequence: 2,
              status: "failed",
              title: "Open resource",
              details: {
                hostCommand: {
                  commandId: "command_001",
                  commandName: "open_resource",
                  payload: { resourceId: "client_001" },
                },
              },
            }),
          ],
        })}
        reasoningVisibility="detailed"
      />,
    );

    expect(html).toContain("Open resource");
    expect(html).toContain('data-state="error"');
    expect(html).not.toContain("host_command_failed");
  });

  it("shows copy only for a completed assistant answer", () => {
    const completed = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({ content: "Copy this answer" })}
        reasoningVisibility="minimal"
      />,
    );
    const streaming = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({ content: "Still streaming", isStreaming: true })}
        reasoningVisibility="minimal"
      />,
    );

    expect(completed).toContain("Copy");
    expect(completed).not.toContain("Retry");
    expect(streaming).not.toContain("Copy");
  });
});

const createAssistantMessage = ({
  activityEvents = [],
  content = "",
  isStreaming = false,
}: {
  readonly activityEvents?: readonly ReturnType<typeof createActivity>[];
  readonly content?: string;
  readonly isStreaming?: boolean;
}): WidgetMessage => ({
  id: "assistant_001",
  role: "assistant",
  content,
  activity: activityEvents.reduce<WidgetActivityTimeline>(
    (timeline, event) => applyActivityEvent(timeline, event),
    { items: [] },
  ),
  isStreaming,
});

const createActivity = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.activity",
  eventId: "event_activity_001",
  assistantTurnId: "turn_001",
  sequence: 1,
  createdAt: "2026-05-25T00:00:00.000Z",
  activityId: "activity_001",
  activityKind: "reasoning",
  status: "completed",
  title: "Thinking",
  ...overrides,
});
