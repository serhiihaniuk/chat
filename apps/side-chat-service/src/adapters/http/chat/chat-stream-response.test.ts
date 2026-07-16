import type { UIMessageChunk } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createChatStreamResponse } from "./chat-stream-response.js";

describe("chat stream response", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps idle comments transparent to UI-message chunk decoding", async () => {
    vi.useFakeTimers();
    const controllerReady =
      Promise.withResolvers<ReadableStreamDefaultController<UIMessageChunk>>();
    const source = new ReadableStream<UIMessageChunk>({
      start: (controller) => controllerReady.resolve(controller),
    });
    const onKeepalive = vi.fn();
    const response = createChatStreamResponse({
      stream: source,
      runId: "run-1",
      keepaliveIntervalMs: 100,
      outboundTransforms: [],
      onKeepalive,
    });
    if (!response.body) throw new Error("Expected a streaming response body");
    const reader = response.body.getReader();
    const idleRead = reader.read();
    await vi.advanceTimersByTimeAsync(100);
    expect(new TextDecoder().decode((await idleRead).value)).toBe(": hb\n\n");
    expect(onKeepalive).toHaveBeenCalledOnce();

    const sourceController = await controllerReady.promise;
    sourceController.enqueue({ type: "start", messageId: "assistant-1" });
    sourceController.enqueue({ type: "finish" });
    sourceController.close();
    const encoded = await readRemainingText(reader);
    expect(decodeChunks(encoded).map((part) => part["type"])).toEqual(["start", "finish"]);
  });

  it("injects a data-* part in order relative to native parts", async () => {
    const response = createChatStreamResponse({
      stream: chunks(
        { type: "start", messageId: "assistant-1" },
        { type: "text-start", id: "text-1" },
        { type: "finish" },
      ),
      runId: "run-1",
      keepaliveIntervalMs: 60_000,
      outboundTransforms: [injectAfterStart({ type: "data-demo", data: { phase: "streaming" } })],
    });
    if (!response.body) throw new Error("Expected a streaming response body");
    const parts = decodeChunks(await new Response(response.body).text());
    expect(parts.map((part) => part["type"])).toEqual([
      "start",
      "data-demo",
      "text-start",
      "finish",
    ]);
  });
});

/** A minimal injector proving the outbound seam can add a sanctioned data part. */
function injectAfterStart(
  part: UIMessageChunk,
): () => TransformStream<UIMessageChunk, UIMessageChunk> {
  return () =>
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        if (chunk.type === "start") controller.enqueue(part);
      },
    });
}

function chunks(...parts: UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

async function readRemainingText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const result = await reader.read();
    if (result.done) return text;
    text += decoder.decode(result.value, { stream: true });
  }
}

function decodeChunks(text: string): Array<Record<string, unknown>> {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .filter((line) => line !== "data: [DONE]")
    .map((line) => parseStreamPart(line.slice(6)));
}

function parseStreamPart(source: string): Record<string, unknown> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw new Error(`Expected a UI message stream part: ${source}`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
