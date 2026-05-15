import { describe, expect, it } from "vitest";
import {
  appendReasoningPart,
  upsertToolPart,
  type WidgetMessagePart,
} from "../hooks/use-side-chat.js";

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
});
