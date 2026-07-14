import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RenderActivityItem } from "#entities/activity";
import type { ToolDetailLevel } from "#entities/settings";

import type { WorkflowTimelineMessage } from "../../model/native-message-projection.js";
import { WorkflowMessageTimeline } from "../workflow-message-timeline.js";

const assistant = (parts: readonly unknown[]): WorkflowTimelineMessage => ({
  id: "assistant-1",
  role: "assistant",
  parts,
});

const renderActivity = (
  parts: readonly unknown[],
  renderActivityItem: RenderActivityItem,
  toolDetail: ToolDetailLevel,
): string =>
  renderToStaticMarkup(
    <WorkflowMessageTimeline
      isStreaming
      message={assistant(parts)}
      renderActivityItem={renderActivityItem}
      toolDetail={toolDetail}
    />,
  );

describe("Workflow activity customization", () => {
  it("keeps hidden and name tool disclosure ahead of custom rendering", () => {
    const parts = [
      {
        type: "dynamic-tool",
        toolCallId: "call-1",
        toolName: "lookup_weather",
        state: "output-available",
        input: { city: "Zurich" },
        output: { temp: 20 },
      },
    ];
    const renderActivityItem = vi.fn<RenderActivityItem>(() => <div>custom-weather</div>);

    const hidden = renderActivity(parts, renderActivityItem, "hidden");
    const name = renderActivity(parts, renderActivityItem, "name");

    expect(renderActivityItem).not.toHaveBeenCalled();
    expect(hidden).not.toContain("custom-weather");
    expect(name).toContain("Lookup weather");
    expect(name).not.toContain("Zurich");
  });

  it("lets full tool detail and reasoning use the shared custom renderer", () => {
    const renderActivityItem = vi.fn<RenderActivityItem>((item) => {
      if (item.kind === "tool") {
        return <div>{`custom-${item.tool.toolName}-${item.status}`}</div>;
      }
      if (item.kind === "reasoning") return <div>{`custom-${item.title}`}</div>;
      return undefined;
    });
    const html = renderActivity(
      [
        { type: "reasoning", text: "checked policy", state: "done" },
        {
          type: "dynamic-tool",
          toolCallId: "call-1",
          toolName: "lookup_weather",
          state: "output-available",
          output: { temp: 20 },
        },
      ],
      renderActivityItem,
      "full",
    );

    expect(html).toContain("custom-checked policy");
    expect(html).toContain("custom-lookup_weather-completed");
    expect(html).not.toContain("Lookup weather");
    expect(renderActivityItem).toHaveBeenCalledTimes(2);
  });

  it("keeps approval cards security-owned and outside custom rendering", () => {
    const renderActivityItem = vi.fn<RenderActivityItem>(() => <div>unsafe-replacement</div>);
    const html = renderActivity(
      [
        {
          type: "dynamic-tool",
          toolCallId: "call-approval",
          toolName: "needs_access",
          state: "approval-requested",
          input: { resourceId: "doc-1" },
          approval: { id: "approval-1" },
        },
      ],
      renderActivityItem,
      "full",
    );

    expect(renderActivityItem).not.toHaveBeenCalled();
    expect(html).toContain('data-slot="tool-approval"');
    expect(html).toContain("Approve");
    expect(html).not.toContain("unsafe-replacement");
  });
});
