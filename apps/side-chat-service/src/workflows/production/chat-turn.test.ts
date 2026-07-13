import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import {
  clientToolResultHookToken,
  preserveDynamicClientToolIdentity,
  toCompletedChatTurnOutcome,
} from "./chat-turn.js";

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as const;
const ACTIVITY_DURATION_MS = 1_501;

describe("completed chat turn outcome", () => {
  it("creates a stable empty assistant UIMessage when the model emits no content", () => {
    const outcome = toCompletedChatTurnOutcome("turn-1", 4, ACTIVITY_DURATION_MS, {
      steps: [{ content: [] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({
      status: "completed",
      finishReason: "stop",
      assistantMessage: {
        id: "turn-1-assistant",
        role: "assistant",
        parts: [],
      },
    });
  });

  it("preserves reasoning-only output as native assistant message parts", () => {
    const outcome = toCompletedChatTurnOutcome("turn-2", 4, ACTIVITY_DURATION_MS, {
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
    const outcome = toCompletedChatTurnOutcome("turn-3", 2, ACTIVITY_DURATION_MS, {
      steps: [{ content: [] }, { content: [] }],
      finishReason: "tool-calls",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "length" });
  });

  it("does not call an ordinary one-step stop a step-limit finish", () => {
    const outcome = toCompletedChatTurnOutcome("turn-4", 1, ACTIVITY_DURATION_MS, {
      steps: [{ content: [{ type: "text", text: "Done" }] }],
      finishReason: "stop",
      totalUsage: ZERO_USAGE,
    });

    expect(outcome).toMatchObject({ finishReason: "stop" });
  });

  it("preserves available reasoning and cached-input usage details", () => {
    const outcome = toCompletedChatTurnOutcome("turn-5", 4, ACTIVITY_DURATION_MS, {
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

describe("client-tool Workflow compatibility", () => {
  it("uses a run-and-call-scoped hook token", () => {
    expect(clientToolResultHookToken("run-1", "call-1")).toBe("tool:run-1:call-1");
  });

  it("restores native dynamic identity after the pinned Workflow transform drops it", async () => {
    const stream = chunks(
      { type: "tool-input-start", toolCallId: "call-1", toolName: "open_file" },
      {
        type: "tool-input-delta",
        toolCallId: "call-1",
        inputTextDelta: '{"path":',
      },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "open_file",
        input: { path: "README.md" },
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { opened: true },
      },
      {
        type: "tool-input-start",
        toolCallId: "call-2",
        toolName: "server_search",
      },
    ).pipeThrough(
      preserveDynamicClientToolIdentity([
        {
          name: "open_file",
          description: "Open a file",
          inputSchema: { type: "object" },
        },
      ]),
    );

    await expect(readAll(stream)).resolves.toEqual([
      {
        type: "tool-input-start",
        toolCallId: "call-1",
        toolName: "open_file",
        dynamic: true,
      },
      {
        type: "tool-input-delta",
        toolCallId: "call-1",
        inputTextDelta: '{"path":',
        dynamic: true,
      },
      {
        type: "tool-input-available",
        toolCallId: "call-1",
        toolName: "open_file",
        input: { path: "README.md" },
        dynamic: true,
      },
      {
        type: "tool-output-available",
        toolCallId: "call-1",
        output: { opened: true },
        dynamic: true,
      },
      {
        type: "tool-input-start",
        toolCallId: "call-2",
        toolName: "server_search",
      },
    ]);
  });
});

function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const output: UIMessageChunk[] = [];
  for await (const part of stream) output.push(part);
  return output;
}
