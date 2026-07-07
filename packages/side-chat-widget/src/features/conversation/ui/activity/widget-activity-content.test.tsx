import { SIDECHAT_PROTOCOL_VERSION, type ActivityEvent } from "@side-chat/chat-protocol";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  applyActivityEvent,
  type WidgetActivityTimeline,
  type WidgetMessage,
} from "#entities/chat";
import { WidgetMessageView } from "../widget-message-view.js";

describe("activity content rendering", () => {
  it("keeps a second concurrently-running tool spinning instead of a false success", () => {
    const message = createAssistantMessage({
      isStreaming: true,
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "running",
          title: "Run mock_web_search",
        }),
        createActivity({
          activityId: "tool_call_002",
          activityKind: "tool",
          sequence: 2,
          status: "running",
          title: "Run mock_fetch_page",
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" toolDetail="full" />,
    );

    // Both running rows spin; the one behind the active item must not read as done.
    expect((html.match(/data-state="running"/gu) ?? []).length).toBe(2);
    expect(html).not.toContain('data-state="success"');
  });

  it("lets renderActivityItem override exactly one item and defaults the rest", () => {
    const message = createAssistantMessage({
      isStreaming: true,
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              input: { query: "news" },
            },
          },
        }),
        createActivity({
          activityId: "reasoning_001",
          activityKind: "reasoning",
          sequence: 2,
          title: "Prepared final answer",
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView
        message={message}
        reasoningVisibility="detailed"
        toolDetail="full"
        renderActivityItem={(item) =>
          item.details?.tool?.toolName === "mock_web_search" ? (
            <div data-testid="custom-tool">Custom search card</div>
          ) : undefined
        }
      />,
    );

    expect(html).toContain("Custom search card");
    // The overridden item's default rendering is fully replaced...
    expect(html).not.toContain("Mock web search");
    // ...while non-matching items keep their defaults.
    expect(html).toContain("Prepared final answer");
  });

  it("renders sources as a message-level fold and images as inline thumbnails", () => {
    const message = createAssistantMessage({
      content: "Here is what I found.",
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            images: [{ alt: "Search preview", mediaType: "image/svg+xml", data: "Zm9v" }],
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              sources: [
                { label: "Mock Search Result", url: "https://example.test/search-result" },
                // Duplicate identity collapses to one numbered row.
                { label: "Mock Search Result", url: "https://example.test/search-result" },
              ],
            },
          },
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="minimal" toolDetail="full" />,
    );

    expect(html).toContain('data-slot="sources-fold"');
    expect(html).toContain("1 source");
    expect(html).toContain('data-slot="activity-images"');
    expect(html).toContain('src="data:image/svg+xml;base64,Zm9v"');
  });

  it('pins the compact row at level "name" — the payloads stay undisclosed', () => {
    const message = createAssistantMessage({
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              input: { query: "news" },
              result: { summary: "found" },
            },
          },
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" toolDetail="name" />,
    );

    expect(html).toContain("Mock web search");
    // No expandable detail row, no payload text.
    expect(html).not.toContain('data-slot="tool-detail-row"');
    expect(html).not.toContain("news");
  });

  it('drops tool rows at level "hidden" and removes a tools-only fold entirely', () => {
    const message = createAssistantMessage({
      content: "Done.",
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            tool: { toolCallId: "tool_call_001", toolName: "mock_web_search" },
          },
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" toolDetail="hidden" />,
    );

    // The only item was a tool: no fold at all, just the answer text.
    expect(html).not.toContain("Mock web search");
    expect(html).not.toContain("Thought process");
    expect(html).toContain("Done.");
  });

  it('keeps reasoning thoughts visible at level "hidden"', () => {
    const message = createAssistantMessage({
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: { tool: { toolCallId: "tool_call_001", toolName: "mock_web_search" } },
        }),
        createActivity({
          activityId: "reasoning_001",
          activityKind: "reasoning",
          sequence: 2,
          title: "Prepared final answer",
        }),
      ],
    });

    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="detailed" toolDetail="hidden" />,
    );

    expect(html).not.toContain("Mock web search");
    expect(html).toContain("Prepared final answer");
  });

  it("renders one sources fold from the answer's footnote citations, plus inline chips", () => {
    const message = createAssistantMessage({
      content:
        "Sky [^1] and sunsets [^2].\n\n[^1]: Rayleigh. https://a.test\n[^2]: OpenStax. https://b.test",
    });
    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="minimal" />,
    );
    // The fold is a sibling of the answer (spaced by --message-stack-gap), not inside
    // MarkdownContent; the answer's markdown still renders the two inline chips.
    expect((html.match(/data-slot="sources-fold"/gu) ?? []).length).toBe(1);
    expect(html).toContain("2 sources");
    expect((html.match(/data-slot="citation-ref"/gu) ?? []).length).toBe(2);
  });

  it("prefers the answer's footnote citations (1) over the tool's attributed sources (2)", () => {
    const message = createAssistantMessage({
      content: "Cited [^1].\n\n[^1]: Curated. https://c.test",
      activityEvents: [
        createActivity({
          activityId: "tool_call_001",
          activityKind: "tool",
          sequence: 1,
          status: "completed",
          title: "Run mock_web_search",
          details: {
            tool: {
              toolCallId: "tool_call_001",
              toolName: "mock_web_search",
              sources: [
                { label: "Tool A", url: "https://a.test" },
                { label: "Tool B", url: "https://b.test" },
              ],
            },
          },
        }),
      ],
    });
    const html = renderToStaticMarkup(
      <WidgetMessageView message={message} reasoningVisibility="minimal" />,
    );
    // The count proves which set fed the (collapsed) fold: the single footnote.
    expect(html).toContain("1 source");
    expect(html).not.toContain("2 sources");
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
