import {
  encodeSseEvent,
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type CompletedEvent,
  type DeltaEvent,
  type SidechatStreamEvent,
  type StartedEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it, vi } from "vitest";

import { createChatClient, type FetchLike } from "./client.js";

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: {
    id: "message-1",
    role: "user",
    content: "hello",
  },
};

const started = (): StartedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: "evt-0",
  assistantTurnId: "turn-1",
  sequence: 0,
  createdAt: "2026-05-23T00:00:00.000Z",
});

const delta = (): DeltaEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: "evt-1",
  assistantTurnId: "turn-1",
  sequence: 1,
  createdAt: "2026-05-23T00:00:01.000Z",
  content: "hello",
});

const completed = (): CompletedEvent => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.completed",
  eventId: "evt-2",
  assistantTurnId: "turn-1",
  sequence: 2,
  createdAt: "2026-05-23T00:00:02.000Z",
  finishReason: "stop",
});

const collect = async (
  events: AsyncIterable<SidechatStreamEvent>,
): Promise<SidechatStreamEvent[]> => {
  const output: SidechatStreamEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

const responseFromEvents = (events: readonly SidechatStreamEvent[]): Response =>
  new Response(streamFromText(events.map(encodeSseEvent).join("")), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

const streamFromText = (text: string): ReadableStream<Uint8Array> => {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
};

describe("createChatClient", () => {
  it("posts a typed protocol request and decodes stream events", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(responseFromEvents([started(), delta(), completed()])),
    );
    const client = createChatClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    const result = await client.streamChat(request);
    const events = await collect(result.events);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://assistant.example.test/chat/stream",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    expect(result.attempt).toBe(1);
    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("passes abort signals to fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(responseFromEvents([started(), completed()])),
    );
    const client = createChatClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await client.streamChat(request, { signal: controller.signal });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: controller.signal,
    });
  });

  it("rejects already aborted requests", async () => {
    const controller = new AbortController();
    controller.abort("cancelled");
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(responseFromEvents([started(), completed()])),
    );
    const client = createChatClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await expect(
      client.streamChat(request, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries configured status failures before streaming", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(responseFromEvents([started(), completed()]));
    const client = createChatClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
      retry: { attempts: 2, statuses: [503] },
    });

    const result = await client.streamChat(request);
    const events = await collect(result.events);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.attempt).toBe(2);
    expect(events.at(-1)?.type).toBe("sidechat.completed");
  });
});
