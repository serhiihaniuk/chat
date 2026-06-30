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

import { createSideChatApiClient, type FetchLike } from "./side-chat-api-client.js";

const request: ChatStreamRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request-1",
  message: {
    id: "message-1",
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

const runResponse = (): Response =>
  Response.json({
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId: "request-1",
    assistantTurnId: "turn-1",
    conversationId: "conversation-1",
    status: "running",
  });

const streamResponse = (events: readonly SidechatStreamEvent[]): Response =>
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

describe("createSideChatApiClient run flow", () => {
  it("creates a run with a JSON identity and an idempotency key", async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(runResponse()));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    const run = await client.createRun(request);

    expect(run).toEqual({
      requestId: "request-1",
      assistantTurnId: "turn-1",
      conversationId: "conversation-1",
      status: "running",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://assistant.example.test/chat/runs");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "idempotency-key": "request-1",
      },
      body: JSON.stringify(request),
    });
  });

  it("subscribes to a turn stream from the given offset and decodes events", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(streamResponse([started(), delta(), completed()])),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    const subscription = await client.subscribeTurn("turn-1", { after: -1 });
    const events = await collect(subscription.events);

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://assistant.example.test/chat/turns/turn-1/stream?after=-1",
    );
    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.delta",
      "sidechat.completed",
    ]);
  });

  it("reconnects from the last seen sequence", async () => {
    const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(streamResponse([completed()])));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await client.subscribeTurn("turn-1", { after: 1 });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://assistant.example.test/chat/turns/turn-1/stream?after=1",
    );
  });

  it("maps a 404 stream open to replay_expired before any event", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response("gone", { status: 404 })),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await expect(client.subscribeTurn("turn-1")).rejects.toMatchObject({
      code: "replay_expired",
      status: 404,
    });
  });

  it("resolves a run id, reads turn status, and cancels a turn", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn-1", status: "running" }))
      .mockResolvedValueOnce(
        Response.json({
          assistantTurnId: "turn-1",
          conversationId: "conversation-1",
          requestId: "request-1",
          status: "completed",
        }),
      )
      .mockResolvedValueOnce(Response.json({ assistantTurnId: "turn-1", cancelRequested: true }));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    expect(await client.resolveRun("request-1")).toEqual({
      assistantTurnId: "turn-1",
      status: "running",
    });
    expect(await client.getTurnStatus("turn-1")).toMatchObject({ status: "completed" });
    expect(await client.cancelTurn("turn-1")).toEqual({
      assistantTurnId: "turn-1",
      cancelRequested: true,
    });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://assistant.example.test/chat/runs/request-1",
      "https://assistant.example.test/chat/turns/turn-1",
      "https://assistant.example.test/chat/turns/turn-1/cancel",
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
  });

  it("rejects an already aborted create", async () => {
    const controller = new AbortController();
    controller.abort("cancelled");
    const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(runResponse()));
    const client = createSideChatApiClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
    });

    await expect(client.createRun(request, { signal: controller.signal })).rejects.toMatchObject({
      code: "aborted",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries configured status failures before a run is created", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(runResponse());
    const client = createSideChatApiClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
      retry: { attempts: 2, statuses: [503] },
    });

    const run = await client.createRun(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(run.assistantTurnId).toBe("turn-1");
  });

  it("does not retry a 409 conflict on the turn-creating create", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(new Response("conflict", { status: 409 })),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://example.test",
      fetch: fetchMock,
      retry: { attempts: 3 },
    });

    await expect(client.createRun(request)).rejects.toMatchObject({
      code: "http_error",
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reads the backend model catalog with reasoning and context metadata", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json({
          protocolVersion: SIDECHAT_PROTOCOL_VERSION,
          defaultModel: { providerId: "openai", modelId: "gpt-5.4-mini" },
          models: [
            {
              providerId: "openai",
              modelId: "gpt-5.4-mini",
              displayName: "GPT-5.4 mini",
              contextWindowTokens: 400_000,
              maxOutputTokens: 128_000,
              default: true,
              available: true,
              reasoning: { defaultEffort: "medium", efforts: ["low", "medium", "high"] },
            },
          ],
        }),
      ),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await expect(client.listModels?.()).resolves.toMatchObject({
      defaultModel: { providerId: "openai", modelId: "gpt-5.4-mini" },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://assistant.example.test/models");
  });

  it("reads the backend tool catalog for the composer tools menu", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json({
          protocolVersion: SIDECHAT_PROTOCOL_VERSION,
          tools: [
            {
              name: "mock_web_search",
              label: "Mock web search",
              description: "Search the web for recent or external information.",
              defaultEnabled: true,
            },
          ],
        }),
      ),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await expect(client.listTools?.()).resolves.toEqual({
      tools: [
        {
          name: "mock_web_search",
          label: "Mock web search",
          description: "Search the web for recent or external information.",
          defaultEnabled: true,
        },
      ],
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://assistant.example.test/tools");
  });

  it("rejects a malformed tool catalog payload", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(Response.json({ tools: [{ name: "mock_web_search" }] })),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await expect(client.listTools?.()).rejects.toThrow(/tools/i);
  });

  it("lists conversations, reads history with activeTurn, resets history, and reads usage", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        Response.json({
          conversations: [
            {
              conversationId: "conversation-1",
              title: "past",
              status: "active",
              createdAt: "2026-05-23T00:00:00.000Z",
              updatedAt: "2026-05-23T00:01:00.000Z",
              lastMessageAt: "2026-05-23T00:01:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          conversationId: "conversation-1",
          messages: [{ id: "m1", role: "user", content: "past", sequence: 0 }],
          activeTurn: { assistantTurnId: "turn-9", status: "running" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ conversationId: "conversation-1", status: "reset" }))
      .mockResolvedValueOnce(Response.json({ inputTokens: 2, outputTokens: 3, totalTokens: 5 }));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    expect(await client.listConversations?.({ limit: 20 })).toMatchObject({
      conversations: [{ conversationId: "conversation-1", title: "past" }],
    });
    expect(await client.readHistory?.("conversation-1", { limit: 10 })).toMatchObject({
      conversationId: "conversation-1",
      messages: [{ content: "past" }],
      activeTurn: { assistantTurnId: "turn-9", status: "running" },
    });
    expect(await client.resetHistory?.("conversation-1")).toMatchObject({ status: "reset" });
    expect(await client.readUsage?.()).toMatchObject({ totalTokens: 5 });

    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://assistant.example.test/chat/conversations?limit=20",
      "https://assistant.example.test/chat/conversations/conversation-1?limit=10",
      "https://assistant.example.test/chat/history/conversation-1",
      "https://assistant.example.test/usage",
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE" });
  });

  it("reads history without an active turn when none is running", async () => {
    const fetchMock = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json({
          conversationId: "conversation-1",
          messages: [],
          activeTurn: null,
        }),
      ),
    );
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    const history = await client.readHistory?.("conversation-1");
    expect(history?.activeTurn).toBeUndefined();
  });

  it("maps non-OK resource responses to HTTP errors", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response("no conversations", { status: 503 }))
      .mockResolvedValueOnce(new Response("no history", { status: 404 }));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await expect(client.listConversations?.()).rejects.toMatchObject({
      code: "http_error",
      status: 503,
    });
    await expect(client.readHistory?.("missing-conversation")).rejects.toMatchObject({
      code: "http_error",
      status: 404,
    });
  });

  it("rejects malformed run and resource JSON", async () => {
    const fetchMock = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json({ requestId: "request-1" }))
      .mockResolvedValueOnce(Response.json({ conversations: [{ conversationId: "c1" }] }))
      .mockResolvedValueOnce(Response.json({ totalTokens: "5" }));
    const client = createSideChatApiClient({
      baseUrl: "https://assistant.example.test",
      fetch: fetchMock,
    });

    await expect(client.createRun(request)).rejects.toMatchObject({ code: "network_error" });
    await expect(client.listConversations?.()).rejects.toMatchObject({ code: "network_error" });
    await expect(client.readUsage?.()).rejects.toMatchObject({ code: "network_error" });
  });
});
