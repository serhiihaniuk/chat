import { describe, expect, it } from "vitest";

import { toCompletedChatTurnOutcome } from "./chat-turn.js";

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as const;

describe("completed chat turn outcome", () => {
  it("creates a stable empty assistant UIMessage when the model emits no content", () => {
    const outcome = toCompletedChatTurnOutcome("turn-1", 4, {
      steps: [{ content: [] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({
      status: "completed",
      finishReason: "stop",
      assistantMessage: { id: "turn-1-assistant", role: "assistant", parts: [] },
    });
  });

  it("preserves reasoning-only output as native assistant message parts", () => {
    const outcome = toCompletedChatTurnOutcome("turn-2", 4, {
      steps: [{ content: [{ type: "reasoning", text: "A private-safe summary" }] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({
      status: "completed",
      assistantMessage: {
        id: "turn-2-assistant",
        role: "assistant",
        parts: [{ type: "reasoning", text: "A private-safe summary" }],
      },
    });
  });

  it("maps a tool-call stop at the configured step cap to length", () => {
    const outcome = toCompletedChatTurnOutcome("turn-3", 2, {
      steps: [{ content: [] }, { content: [] }],
      finishReason: "tool-calls",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "length" });
  });

  it("does not call an ordinary one-step stop a step-limit finish", () => {
    const outcome = toCompletedChatTurnOutcome("turn-4", 1, {
      steps: [{ content: [{ type: "text", text: "Done" }] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "stop" });
  });

  it("preserves available reasoning and cached-input usage details", () => {
    const outcome = toCompletedChatTurnOutcome("turn-5", 4, {
      steps: [{ content: [] }],
      finishReason: "stop",
      totalUsage: {
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        inputTokenDetails: { cacheReadTokens: 5 },
        outputTokenDetails: { reasoningTokens: 3 },
      },
    });

    expect(outcome).toMatchObject({
      usage: { reasoningTokens: 3, cachedInputTokens: 5 },
    });
  });
});
