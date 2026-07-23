import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { RenderActivityItem } from "#entities/activity";
import type { ToolDetailLevel } from "#entities/settings";
import { createReactDomTestHarness } from "#testing/react-dom-test-harness";

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

  it("labels approval decisions as an actionable group and announces pending submit", async () => {
    const harness = createReactDomTestHarness();
    const pendingDecision = createDeferred<void>();
    const onApprovalDecision = vi.fn<() => Promise<void>>(() => pendingDecision.promise);

    try {
      harness.render(
        <WorkflowMessageTimeline
          isStreaming
          message={assistant([
            {
              type: "dynamic-tool",
              toolCallId: "call-approval",
              toolName: "needs_access",
              state: "approval-requested",
              input: { resourceId: "doc-1" },
              approval: { id: "approval-1" },
            },
          ])}
          onApprovalDecision={onApprovalDecision}
        />,
      );

      const approvalGroup = harness.container.querySelector<HTMLElement>(
        '[data-slot="tool-approval"]',
      );
      expect(approvalGroup?.getAttribute("role")).toBe("group");
      expect(approvalGroup?.getAttribute("aria-label")).toBe("Needs access: Approval required");
      const status = approvalGroup?.querySelector<HTMLElement>('[role="status"]');
      expect(status?.getAttribute("aria-live")).toBe("polite");
      expect(status?.textContent).toBe("Approval required");

      const approveButton = Array.from(harness.container.querySelectorAll("button")).find(
        (button) => button.textContent === "Approve",
      );
      if (!approveButton) throw new Error("Expected an approval button.");
      act(() => approveButton.click());

      expect(onApprovalDecision).toHaveBeenCalledWith("approval-1", true);
      expect(approvalGroup?.getAttribute("aria-busy")).toBe("true");
      expect(status?.textContent).toBe("Submitting approval decision.");

      await act(async () => {
        pendingDecision.resolve();
        await pendingDecision.promise;
      });
    } finally {
      harness.cleanup();
    }
  });
});

function createDeferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
} {
  let resolve = (_value: Value): void => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
