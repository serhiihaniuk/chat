import {
  encodeSseEvent,
  SIDECHAT_PROTOCOL_VERSION,
  type CompletedEvent,
  type DeltaEvent,
  type ErrorEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";

import { ChatClientError } from "#http/errors";
import { decodeChunkedSseStream, type StreamChunk } from "./sse-reader.js";

const collect = async (chunks: readonly StreamChunk[]): Promise<SidechatStreamEvent[]> => {
  const events: SidechatStreamEvent[] = [];
  for await (const event of decodeChunkedSseStream(toAsync(chunks))) {
    events.push(event);
  }
  return events;
};

const toAsync = async function* (chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  for (const chunk of chunks) {
    await Promise.resolve();
    yield chunk;
  }
};

const started = (sequence = 0): StartedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
});

const delta = (sequence = 1): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:01.000Z",
  content: "hello",
});

const completed = (sequence = 2): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:02.000Z",
  finishReason: "stop",
});

const terminalError = (sequence = 1): ErrorEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.error",
  eventId: `evt-${sequence}`,
  assistantTurnId: "turn-1",
  sequence,
  createdAt: "2026-05-23T00:00:02.000Z",
  code: "provider_failed",
  message: "provider failed",
  retryable: true,
});

describe("decodeChunkedSseStream", () => {
  it("decodes split mock SSE frames", async () => {
    const stream = [started(), delta(), completed()].map(encodeSseEvent).join("");
    const events = await collect([
      stream.slice(0, 9),
      stream.slice(9, 41),
      new TextEncoder().encode(stream.slice(41)),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("yields protocol terminal error events", async () => {
    const events = await collect([encodeSseEvent(started()), encodeSseEvent(terminalError())]);

    expect(events.at(-1)).toMatchObject({
      type: "sidechat.error",
      code: "provider_failed",
      retryable: true,
    });
  });

  it("rejects malformed partial frames", async () => {
    await expect(collect(["event: sidechat.delta\ndata: {"])).rejects.toMatchObject({
      code: "malformed_stream",
    });
  });

  it("rejects events after a terminal event", async () => {
    const stream = [started(), completed(), delta(3)].map(encodeSseEvent).join("");

    await expect(collect([stream])).rejects.toMatchObject({
      code: "malformed_stream",
    });
  });

  it("rejects streams without a terminal event", async () => {
    await expect(collect([encodeSseEvent(started())])).rejects.toBeInstanceOf(ChatClientError);
  });
});
