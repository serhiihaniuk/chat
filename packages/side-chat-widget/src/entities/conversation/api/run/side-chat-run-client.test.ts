import {
  SIDECHAT_PROTOCOL_VERSION,
  encodeSseEvent,
  type ChatStreamRequest,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { describe, expect, it, vi } from "vitest";

import type { FetchLike } from "../client/side-chat-api-types.js";
import {
  cancelTurnWithFetch,
  createRunWithFetch,
  getTurnStatusWithFetch,
  resolveRunWithFetch,
} from "./side-chat-run-client.js";

const clientOptions = { baseUrl: "https://example.test" } as const;

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: { id: "message-1", content: "hello" },
};

const startedEvent: SidechatStreamEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.started",
  eventId: "evt-0",
  assistantTurnId: "turn-1",
  sequence: 0,
  createdAt: "2026-05-23T00:00:00.000Z",
  conversationId: "conversation-1",
};

const deltaEvent: SidechatStreamEvent = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: "sidechat.delta",
  eventId: "evt-1",
  assistantTurnId: "turn-1",
  sequence: 1,
  createdAt: "2026-05-23T00:00:01.000Z",
  content: "hello",
};

const streamResponse = (events: readonly SidechatStreamEvent[]): Response =>
  new Response(new TextEncoder().encode(events.map(encodeSseEvent).join("")), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

const collect = async (
  events: AsyncIterable<SidechatStreamEvent>,
): Promise<SidechatStreamEvent[]> => {
  const output: SidechatStreamEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};

describe("side chat run client", () => {
  it("encodes ids into resolve, status, and cancel paths", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn 1", status: "running" }))
      .mockResolvedValueOnce(
        Response.json({
          assistantTurnId: "turn 1",
          conversationId: "c1",
          requestId: "request-1",
          status: "completed",
        }),
      )
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn 1", cancelRequested: false }));

    await resolveRunWithFetch("req 1", clientOptions, {}, fetchMock);
    await getTurnStatusWithFetch("turn 1", clientOptions, {}, fetchMock);
    await cancelTurnWithFetch("turn 1", clientOptions, {}, fetchMock);

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://example.test/chat/runs/req%201",
      "https://example.test/chat/turns/turn%201",
      "https://example.test/chat/turns/turn%201/cancel",
    ]);
  });

  it("surfaces a non-retryable network failure from create", async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.reject(new TypeError("offline")));

    await expect(createRunWithFetch(request, clientOptions, {}, fetchMock)).rejects.toMatchObject({
      code: "network_error",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exhausts the retry budget and reports the last status error", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response("busy", { status: 503 })),
    );

    await expect(
      createRunWithFetch(request, { ...clientOptions, retry: { attempts: 2 } }, {}, fetchMock),
    ).rejects.toMatchObject({ code: "http_error", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a run stream that does not begin with the identity frame", async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(streamResponse([deltaEvent])));

    await expect(createRunWithFetch(request, clientOptions, {}, fetchMock)).rejects.toMatchObject({
      code: "network_error",
    });
  });

  it("never re-POSTs once the stream has been accepted, even if it fails mid-read", async () => {
    // The body dies after the identity frame; the failure must surface from the
    // stream, not trigger another create attempt.
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(new TextEncoder().encode(encodeSseEvent(startedEvent)));
          return;
        }
        controller.error(new Error("connection lost"));
      },
    });
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }),
      ),
    );

    const run = await createRunWithFetch(
      request,
      { ...clientOptions, retry: { attempts: 3, statuses: [500, 503] } },
      {},
      fetchMock,
    );
    expect(run.assistantTurnId).toBe("turn-1");
    await expect(collect(run.events)).rejects.toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a 404 on create to replay_expired (a swept, finished duplicate)", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response("gone", { status: 404 })),
    );

    await expect(createRunWithFetch(request, clientOptions, {}, fetchMock)).rejects.toMatchObject({
      code: "replay_expired",
      status: 404,
    });
  });
});
