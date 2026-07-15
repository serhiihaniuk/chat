import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowUIMessage } from "#entities/workflow-chat";
import {
  consumeNativeMessages,
  type WorkflowWidgetChatStreamEnd,
} from "./workflow-widget-chat-engine.js";

describe("consumeNativeMessages", () => {
  it("coalesces a packed replay into bounded progressive paints", async () => {
    let releaseFirstYield: (() => void) | undefined;
    let yieldCount = 0;
    const messages: WorkflowUIMessage[] = [];
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();
    const consume = consumeNativeMessages(
      packedTextStream("abcdef"),
      {
        onMessage: (message) => messages.push(message),
        onStreamEnded,
      },
      new AbortController().signal,
      {
        maxMessagesPerSlice: 2,
        maxSliceMs: Number.POSITIVE_INFINITY,
        now: () => 0,
        yieldToBrowser: () => {
          yieldCount += 1;
          if (yieldCount !== 1) return Promise.resolve();
          return new Promise<void>((resolve) => {
            releaseFirstYield = resolve;
          });
        },
      },
    );

    await vi.waitFor(() => expect(yieldCount).toBe(1));
    expect(messages).toHaveLength(1);
    expect(lastText(messages)).not.toBe("abcdef");
    expect(onStreamEnded).not.toHaveBeenCalled();

    releaseFirstYield?.();
    await consume;

    expect(lastText(messages)).toBe("abcdef");
    expect(messages.length).toBeLessThan(10);
    expect(onStreamEnded).toHaveBeenCalledOnce();
    expect(yieldCount).toBeGreaterThan(1);
  });

  it("paints sparse partial output without waiting for another token", async () => {
    let controllerRef: ReadableStreamDefaultController<UIMessageChunk> | undefined;
    let releaseFirstPaint: (() => void) | undefined;
    let paintCount = 0;
    const messages: WorkflowUIMessage[] = [];
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controllerRef = controller;
        controller.enqueue({ type: "start", messageId: "assistant-1" });
        controller.enqueue({ type: "text-start", id: "text-1" });
        controller.enqueue({ type: "text-delta", id: "text-1", delta: "Partial" });
      },
    });
    const consume = consumeNativeMessages(
      stream,
      {
        onMessage: (message) => messages.push(message),
        onStreamEnded,
      },
      new AbortController().signal,
      {
        maxMessagesPerSlice: 64,
        maxSliceMs: Number.POSITIVE_INFINITY,
        now: () => 0,
        yieldToBrowser: () => {
          paintCount += 1;
          if (paintCount !== 1) return Promise.resolve();
          return new Promise<void>((resolve) => {
            releaseFirstPaint = resolve;
          });
        },
      },
    );

    await vi.waitFor(() => expect(releaseFirstPaint).toBeTypeOf("function"));
    expect(messages).toHaveLength(0);
    releaseFirstPaint?.();
    await vi.waitFor(() => expect(lastText(messages)).toBe("Partial"));
    expect(onStreamEnded).not.toHaveBeenCalled();

    if (!controllerRef) throw new Error("Expected the sparse stream controller");
    controllerRef.enqueue({ type: "text-end", id: "text-1" });
    controllerRef.enqueue({ type: "finish", finishReason: "stop" });
    controllerRef.close();
    await consume;

    expect(onStreamEnded).toHaveBeenCalledOnce();
  });
});

function packedTextStream(text: string): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "start", messageId: "assistant-1" });
      controller.enqueue({ type: "text-start", id: "text-1" });
      for (const character of text) {
        controller.enqueue({ type: "text-delta", id: "text-1", delta: character });
      }
      controller.enqueue({ type: "text-end", id: "text-1" });
      controller.enqueue({ type: "finish", finishReason: "stop" });
      controller.close();
    },
  });
}

function lastText(messages: readonly WorkflowUIMessage[]): string | undefined {
  const message = messages.at(-1);
  const part = message?.parts.find((candidate) => candidate.type === "text");
  return part?.type === "text" ? part.text : undefined;
}
