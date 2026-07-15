import { describe, expect, it } from "vitest";

import type { WorkflowUIMessage } from "#entities/workflow-chat";
import { readWorkflowClientToolCalls } from "./workflow-client-tool-callback.js";

describe("readWorkflowClientToolCalls", () => {
  it("extracts a ready native tool projection without retaining dispatch state", () => {
    const message: WorkflowUIMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-open_document",
          toolCallId: "tool-call-1",
          state: "input-available",
          input: { resourceId: "doc-1" },
        },
      ],
    };

    expect(readWorkflowClientToolCalls(message)).toEqual([
      {
        input: { resourceId: "doc-1" },
        toolCallId: "tool-call-1",
        toolName: "open_document",
      },
    ]);
  });

  it("ignores provider-executed and already-settled tool parts", () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-search",
          toolCallId: "provider-tool",
          state: "input-available",
          input: {},
          providerExecuted: true,
        },
        {
          type: "tool-open_document",
          toolCallId: "settled-tool",
          state: "output-available",
          input: {},
          output: {},
        },
      ],
    } satisfies WorkflowUIMessage;

    expect(readWorkflowClientToolCalls(message)).toEqual([]);
  });
});
