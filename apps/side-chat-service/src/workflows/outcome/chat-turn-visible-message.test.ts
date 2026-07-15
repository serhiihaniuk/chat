import type { ModelCallStreamPart } from "@ai-sdk/workflow";
import { describe, expect, it } from "vitest";

import { readVisibleAssistantMessage } from "./chat-turn-visible-message.js";

describe("readVisibleAssistantMessage", () => {
  it("reassembles streamed reasoning and text in source order", async () => {
    const message = await readVisibleAssistantMessage(
      "turn-1",
      parts(
        { type: "reasoning-start", id: "reasoning-1" },
        { type: "reasoning-delta", id: "reasoning-1", text: "First " },
        { type: "reasoning-delta", id: "reasoning-1", text: "thought" },
        { type: "reasoning-end", id: "reasoning-1" },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", text: "Partial " },
        { type: "text-delta", id: "text-1", text: "answer" },
        { type: "text-end", id: "text-1" },
        { type: "error", error: new Error("private provider failure") },
      ),
    );

    expect(message).toMatchObject({
      id: "turn-1-assistant",
      role: "assistant",
    });
    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "reasoning",
        text: "First thought",
        state: "done",
      }),
    );
    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "text",
        text: "Partial answer",
        state: "done",
      }),
    );
  });

  it("does not create an empty assistant message when no visible deltas exist", async () => {
    await expect(
      readVisibleAssistantMessage(
        "turn-2",
        parts({
          type: "model-call-start",
          warnings: [],
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it("persists the native tool lifecycle and attributed sources", async () => {
    const message = await readVisibleAssistantMessage(
      "turn-3",
      parts(
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "mock_web_search",
          input: { query: "latest news" },
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "mock_web_search",
          input: { query: "latest news" },
          output: { summary: "Current results" },
        },
        {
          type: "source",
          sourceType: "url",
          id: "call-1:source:1",
          url: "https://example.test/news",
          title: "Example News",
        },
        { type: "text-start", id: "text-1" },
        { type: "text-delta", id: "text-1", text: "Found it." },
        { type: "text-end", id: "text-1" },
      ),
    );

    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-mock_web_search",
        toolCallId: "call-1",
        state: "output-available",
        input: { query: "latest news" },
        output: { summary: "Current results" },
      }),
    );
    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "source-url",
        sourceId: "call-1:source:1",
        url: "https://example.test/news",
        title: "Example News",
      }),
    );
    expect(message?.parts).toContainEqual(
      expect.objectContaining({ type: "text", text: "Found it." }),
    );
  });

  it("removes transient approval metadata after an approved tool completes", async () => {
    const message = await readVisibleAssistantMessage(
      "turn-4",
      parts(
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "mock_web_search",
          input: { query: "latest news" },
        },
        {
          type: "tool-approval-request",
          toolCallId: "call-1",
          approvalId: "approval-call-1",
        },
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "mock_web_search",
          input: { query: "latest news" },
          output: { summary: "Current results" },
        },
      ),
    );

    expect(message?.parts).toContainEqual(
      expect.objectContaining({
        type: "tool-mock_web_search",
        toolCallId: "call-1",
        state: "output-available",
        output: { summary: "Current results" },
      }),
    );
    expect(message?.parts).not.toContainEqual(
      expect.objectContaining({ approval: expect.anything() }),
    );
  });
});

function parts(...values: unknown[]): ReadableStream<ModelCallStreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) controller.enqueue(value as ModelCallStreamPart);
      controller.close();
    },
  });
}
