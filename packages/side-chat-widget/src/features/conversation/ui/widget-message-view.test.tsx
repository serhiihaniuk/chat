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
  it("renders assistant content with its completed reasoning collapsed", () => {
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

    const html = renderToStaticMarkup(<WidgetMessageView message={message} />);

    expect(html).toContain("Here is the answer.");
    expect(html).toContain("Thought process");
    expect(html).not.toContain("rotate-180");
    expect(html).not.toContain("Checked portfolio context");
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

    const html = renderToStaticMarkup(<WidgetMessageView message={message} />);

    expect(html.indexOf("Searching the web")).toBeLessThan(html.indexOf("Mock web search"));
    expect(html.indexOf("Mock web search")).toBeLessThan(html.indexOf("Prepared final answer"));
  });

  it("renders final assistant markdown through the message response renderer", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Common causes include:\n\n- Too much debt\n- Asset bubbles",
        })}
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
      />,
    );

    expect(html).toContain("Thinking...");
    expect(html).toContain("Checking context");
    expect(html).toContain("rotate-180");
  });

  it("opens live tool activity", () => {
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
      />,
    );

    expect(html).toContain("Thinking...");
    expect(html).toContain("Mock web search");
    expect(html).toContain("rotate-180");
  });

  it("keeps completed reasoning collapsed by default", () => {
    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Done.",
          activityEvents: [
            createActivity({
              activityId: "reasoning_001",
              activityKind: "reasoning",
              sequence: 1,
              title: "**Checked** context",
            }),
          ],
        })}
      />,
    );

    expect(html).toContain("Thought process");
    expect(html).not.toContain("rotate-180");
    expect(html).not.toContain("Checked");
  });

  it("keeps another completed reasoning trace collapsed by default", () => {
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
      />,
    );

    expect(html).toContain("Thought process");
    expect(html).not.toContain("rotate-180");
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
      />,
    );

    expect(html).toContain("Open resource");
    expect(html).toContain('data-state="error"');
    expect(html).not.toContain("host_command_failed");
  });

  it("shows copy only for a completed assistant answer", () => {
    const completed = renderToStaticMarkup(
      <WidgetMessageView message={createAssistantMessage({ content: "Copy this answer" })} />,
    );
    const streaming = renderToStaticMarkup(
      <WidgetMessageView
        message={createAssistantMessage({
          content: "Still streaming",
          isStreaming: true,
        })}
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
