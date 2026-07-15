import { describe, expect, it } from "vitest";

import type { WorkflowUIMessage } from "#entities/workflow-chat";

import { projectLatestAssistantUsage } from "./assistant-usage-projection.js";

describe("projectLatestAssistantUsage", () => {
  it("projects usage from the newest assistant message only", () => {
    const messages: WorkflowUIMessage[] = [
      { id: "user-1", role: "user", parts: [] },
      {
        id: "assistant-1",
        role: "assistant",
        metadata: {
          usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        },
        parts: [],
      },
      { id: "user-2", role: "user", parts: [] },
      {
        id: "assistant-2",
        role: "assistant",
        metadata: {
          usage: { inputTokens: 4, outputTokens: 5, totalTokens: 9 },
        },
        parts: [],
      },
    ];

    expect(projectLatestAssistantUsage(messages)).toBe(9);
    expect(projectLatestAssistantUsage(messages.slice(0, 3))).toBe(3);
    expect(projectLatestAssistantUsage(messages.slice(0, 1))).toBeUndefined();
  });
});
