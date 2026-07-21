import type { UIMessageChunk } from "ai";
import { describe, expect, it, vi } from "vitest";

import type { WorkflowUIMessage } from "#entities/workflow-chat";
import { consumeNativeMessages, type WorkflowWidgetChatStreamEnd } from "./native-message-drain.js";

describe("consumeNativeMessages", () => {
  it("reports the native finish reason after draining the final projection", async () => {
    const messages: WorkflowUIMessage[] = [];
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();

    await consumeNativeMessages(
      packedTextStream("complete"),
      { onMessage: (message) => messages.push(message), onStreamEnded },
      new AbortController().signal,
      immediateScheduler(),
    );

    expect(lastText(messages)).toBe("complete");
    expect(onStreamEnded).toHaveBeenCalledWith({ finishReason: "stop", serverAborted: false });
  });

  it("treats an error chunk as server lifecycle input instead of a dropped transport", async () => {
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();

    await consumeNativeMessages(
      nativeChunkStream([{ type: "error", errorText: "safe server error" }]),
      { onMessage: () => undefined, onStreamEnded },
      new AbortController().signal,
      immediateScheduler(),
    );

    expect(onStreamEnded).toHaveBeenCalledWith({
      finishReason: undefined,
      serverAborted: false,
    });
  });

  it("rejects invalid public message metadata at the stream boundary", async () => {
    const invalidStart = {
      type: "start",
      messageId: "assistant-1",
      messageMetadata: { status: "not-a-side-chat-status" },
    } satisfies UIMessageChunk;

    await expect(
      consumeNativeMessages(
        nativeChunkStream([invalidStart]),
        { onMessage: () => undefined, onStreamEnded: () => undefined },
        new AbortController().signal,
        immediateScheduler(),
      ),
    ).rejects.toThrow("Workflow stream metadata is invalid.");
  });

  it("publishes no messages or terminal after its attachment epoch is aborted", async () => {
    const onMessage = vi.fn<(message: WorkflowUIMessage) => void>();
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();
    const abortController = new AbortController();
    abortController.abort();

    await consumeNativeMessages(
      packedTextStream("ignored"),
      { onMessage, onStreamEnded },
      abortController.signal,
      immediateScheduler(),
    );

    expect(onMessage).not.toHaveBeenCalled();
    expect(onStreamEnded).not.toHaveBeenCalled();
  });

  it("coalesces a packed replay into bounded progressive paints", async () => {
    let releaseFirstYield: (() => void) | undefined;
    let yieldCount = 0;
    const messages: WorkflowUIMessage[] = [];
    const onStreamEnded = vi.fn<(end: WorkflowWidgetChatStreamEnd) => void>();
    const consume = consumeNativeMessages(
      packedTextStream("abcdef"),
      { onMessage: (message) => messages.push(message), onStreamEnded },
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
      { onMessage: (message) => messages.push(message), onStreamEnded },
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

function nativeChunkStream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}

function immediateScheduler() {
  return {
    maxMessagesPerSlice: 64,
    maxSliceMs: Number.POSITIVE_INFINITY,
    now: () => 0,
    yieldToBrowser: () => Promise.resolve(),
  };
}

function lastText(messages: readonly WorkflowUIMessage[]): string | undefined {
  const message = messages.at(-1);
  const part = message?.parts.find((candidate) => candidate.type === "text");
  return part?.type === "text" ? part.text : undefined;
}
