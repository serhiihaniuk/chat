import { normalizeUIMessageStreamParts } from "@ai-sdk/workflow";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

describe("durable replay normalization", () => {
  it("produces one visible part when a completed text frame is redelivered", async () => {
    const frame: readonly UIMessageChunk[] = [
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "Hello" },
      { type: "text-end", id: "text-1" },
    ];
    const raw = chunks(
      { type: "start", messageId: "assistant-1" },
      { type: "start-step" },
      ...frame,
      ...frame,
      { type: "finish-step" },
      { type: "finish" },
    );
    const normalized = iterableStream(normalizeUIMessageStreamParts(raw));

    let visible: UIMessage | undefined;
    for await (const message of readUIMessageStream({ stream: normalized })) visible = message;

    const textParts = visible?.parts.filter((part) => part.type === "text") ?? [];
    expect(textParts).toHaveLength(1);
    expect(textParts[0]?.text).toBe("Hello");
    expect(textParts[0]?.state).toBe("done");
  });
});

async function* chunks(...parts: readonly UIMessageChunk[]): AsyncGenerator<UIMessageChunk> {
  for (const part of parts) yield part;
}

function iterableStream(source: AsyncIterable<UIMessageChunk>): ReadableStream<UIMessageChunk> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel() {
      return iterator.return?.().then(() => undefined);
    },
  });
}
