import { describe, expect, it } from "vitest";

import type { WidgetActivityItem } from "#entities/chat";
import { toProtocolSideChatActivityItem } from "#features/conversation";
import { toWorkflowSideChatActivityItem, type WorkflowTimelineItem } from "#features/workflow-chat";

describe("SideChatActivityItem adapters", () => {
  it("gives protocol and workflow tools the same transport-neutral semantics", () => {
    const protocol: WidgetActivityItem = {
      id: "tool-1",
      kind: "tool",
      sequence: 1,
      status: "completed",
      title: "Lookup weather",
      details: {
        tool: {
          toolCallId: "tool-call-1",
          toolName: "lookup_weather",
          input: { city: "Zurich" },
          result: { temperature: 20 },
        },
      },
      createdAt: "2026-07-14T00:00:00.000Z",
    };
    const workflow: Extract<WorkflowTimelineItem, { kind: "tool" }> = {
      id: "tool-1",
      kind: "tool",
      toolCallId: "tool-call-1",
      toolName: "lookup_weather",
      name: "Lookup weather",
      state: "output-available",
      input: { city: "Zurich" },
      output: { temperature: 20 },
    };

    expect(toProtocolSideChatActivityItem(protocol)).toEqual(
      toWorkflowSideChatActivityItem(workflow),
    );
  });

  it("normalizes host detail without leaking protocol-only sources or images", () => {
    const protocol: WidgetActivityItem = {
      id: "host-1",
      kind: "host_command",
      sequence: 1,
      status: "completed",
      title: "Open resource",
      body: "Opened the requested resource",
      details: {
        sources: [{ label: "Private projection detail" }],
        images: [{ alt: "Preview", mediaType: "image/png", data: "AA" }],
        hostCommand: {
          commandId: "command-1",
          commandName: "open_resource",
          payload: { resourceId: "doc-1" },
          result: { status: "completed" },
        },
      },
      createdAt: "2026-07-14T00:00:00.000Z",
    };

    expect(toProtocolSideChatActivityItem(protocol)).toEqual({
      id: "host-1",
      kind: "host_command",
      status: "completed",
      title: "Open resource",
      body: "Opened the requested resource",
      hostCommand: {
        commandId: "command-1",
        commandName: "open_resource",
        payload: { resourceId: "doc-1" },
        result: { status: "completed" },
      },
    });
  });
});
