import { describe, expect, it } from "vitest";
import {
  appendReasoningPart,
  upsertHostCommandPart,
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
});
