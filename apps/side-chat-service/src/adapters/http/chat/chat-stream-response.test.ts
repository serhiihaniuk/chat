import { afterEach, describe, expect, it, vi } from "vitest";

import { TURN_OUTPUT_EVENT_TYPES, type TurnOutputEvent } from "#domain/turn/turn";

import { createChatStreamResponse } from "./chat-stream-response.js";

describe("chat stream response", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps idle comments transparent to UI-message chunk decoding", async () => {
    vi.useFakeTimers();
    const controllerReady =
      Promise.withResolvers<ReadableStreamDefaultController<TurnOutputEvent>>();
    const source = new ReadableStream<TurnOutputEvent>({
      start: (controller) => controllerReady.resolve(controller),
    });
    const response = createChatStreamResponse({
      stream: source,
      runId: "run-1",
      keepaliveIntervalMs: 100,
      outboundTransforms: [],
    });
    if (!response.body) throw new Error("Expected a streaming response body");
    const reader = response.body.getReader();
    const idleRead = reader.read();
    await vi.advanceTimersByTimeAsync(100);
    expect(new TextDecoder().decode((await idleRead).value)).toBe(": hb\n\n");

    const sourceController = await controllerReady.promise;
    sourceController.enqueue({
      type: TURN_OUTPUT_EVENT_TYPES.START,
      messageId: "assistant-1",
    });
    sourceController.enqueue({ type: TURN_OUTPUT_EVENT_TYPES.FINISH });
    sourceController.close();
    const encoded = await readRemainingText(reader);
    expect(decodeDataLines(encoded).map((part) => part.type)).toEqual(["start", "finish"]);
  });
});

async function readRemainingText(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const result = await reader.read();
    if (result.done) return text;
    text += decoder.decode(result.value, { stream: true });
  }
}

function decodeDataLines(text: string): Array<Readonly<{ type: string }>> {
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .filter((line) => line !== "data: [DONE]")
    .map((line) => parseStreamPart(line.slice(6)));
}

function parseStreamPart(source: string): Readonly<{ type: string }> {
  const value: unknown = JSON.parse(source);
  if (!isRecord(value) || typeof value["type"] !== "string") {
    throw new Error(`Expected a UI message stream part: ${source}`);
  }
  return { type: value["type"] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
