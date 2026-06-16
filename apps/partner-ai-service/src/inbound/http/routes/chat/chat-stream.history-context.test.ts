import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type AiRuntimePort,
  type AiRuntimeRequest,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  decodeSseEvents,
  type ChatStreamRequest,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { Stream } from "effect";
import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { createPartnerAiServiceApp } from "../../app.js";

const firstRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_history_context_001",
  message: {
    id: "message_history_context_001",
    content: "hello configured service",
  },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    title: "History context test",
  },
} satisfies ChatStreamRequest;

describe("partner ai service conversation history context", () => {
  it("admits prior conversation messages into the next runtime request", async () => {
    const harness = createHistoryHarness();
    const firstResponse = await postStreamRequest(harness.app, firstRequest);
    const conversationId = readStartedConversationId(await firstResponse.text());

    const secondResponse = await postStreamRequest(harness.app, followUpRequest(conversationId));
    expect(secondResponse.status).toBe(200);
    await secondResponse.text();

    const visibleRequests = visibleRuntimeRequests(harness.runtimeRequests);
    expect(runtimeChatMessages(visibleRequests[1])).toEqual([
      { role: "user", content: "hello configured service" },
      { role: "assistant", content: "Recorded history context." },
      { role: "user", content: "what did I say first?" },
    ]);
    expect(visibleRequests[1]).not.toHaveProperty("contextBoard");
    expect(runtimeChatMessages(visibleRequests[1])[0]).not.toHaveProperty("id");
  });

  it("uses reset as a history context boundary", async () => {
    const harness = createHistoryHarness();
    const firstResponse = await postStreamRequest(harness.app, firstRequest);
    const conversationId = readStartedConversationId(await firstResponse.text());
    const reset = await harness.app.request(`/chat/history/${conversationId}`, {
      method: "DELETE",
      headers: { authorization: "Bearer local-test-token" },
    });
    expect(reset.status).toBe(200);

    const secondResponse = await postStreamRequest(harness.app, followUpRequest(conversationId));
    expect(secondResponse.status).toBe(200);
    await secondResponse.text();

    const visibleRequests = visibleRuntimeRequests(harness.runtimeRequests);
    expect(runtimeChatMessages(visibleRequests[1])).toEqual([
      { role: "user", content: "what did I say first?" },
    ]);
    expect(visibleRequests[1]).not.toHaveProperty("contextBoard");
  });

  it("admits persisted user messages from failed prior turns only", async () => {
    const harness = createHistoryHarness({
      runtimeEvents: (request, callIndex) =>
        callIndex === 0
          ? createFailedRuntimeEvents(request)
          : createCompletedRuntimeEvents(request),
    });
    const firstResponse = await postStreamRequest(harness.app, firstRequest);
    const firstBody = await firstResponse.text();
    const conversationId = readStartedConversationId(firstBody);

    expect(decodeSseEvents(firstBody)).toContainEqual(
      expect.objectContaining({ type: SIDECHAT_EVENT_TYPES.ERROR }),
    );

    const secondResponse = await postStreamRequest(harness.app, followUpRequest(conversationId));
    expect(secondResponse.status).toBe(200);
    await secondResponse.text();

    const visibleRequests = visibleRuntimeRequests(harness.runtimeRequests);
    expect(runtimeChatMessages(visibleRequests[1])).toEqual([
      { role: "user", content: "hello configured service" },
      { role: "user", content: "what did I say first?" },
    ]);
    expect(visibleRequests[1]).not.toHaveProperty("contextBoard");
  });
});

type HistoryHarness = {
  readonly app: ReturnType<typeof createPartnerAiServiceApp>;
  readonly runtimeRequests: AiRuntimeRequest[];
};

type RuntimeEventsFactory = (
  request: AiRuntimeRequest,
  callIndex: number,
) => readonly RuntimeEvent[];

const createHistoryHarness = ({
  runtimeEvents = createCompletedRuntimeEvents,
}: {
  readonly runtimeEvents?: RuntimeEventsFactory;
} = {}): HistoryHarness => {
  const runtimeRequests: AiRuntimeRequest[] = [];
  return {
    runtimeRequests,
    app: createPartnerAiServiceApp({
      repositories: createMemorySidechatRepositories(),
      agentRuntime: recordRuntimeRequests(runtimeRequests, runtimeEvents),
      capabilities: {
        ...DEFAULT_SERVICE_CAPABILITY_CONFIG,
        history: { mode: "recent_messages", maxMessages: 6, maxTokens: 900 },
      },
    }),
  };
};

const postStreamRequest = async (
  app: ReturnType<typeof createPartnerAiServiceApp>,
  request: ChatStreamRequest,
): Promise<Response> =>
  app.request("/chat/stream", {
    method: "POST",
    headers: {
      authorization: "Bearer local-test-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

const followUpRequest = (conversationId: string): ChatStreamRequest => ({
  ...firstRequest,
  requestId: "request_history_context_002",
  conversationId,
  message: {
    id: "message_history_context_002",
    content: "what did I say first?",
  },
});

const readStartedConversationId = (body: string): string => {
  const started = decodeSseEvents(body).find(
    (event) => event.type === SIDECHAT_EVENT_TYPES.STARTED,
  );
  if (!started || !("conversationId" in started) || !started.conversationId) {
    throw new Error("Expected stream to include a started event with conversationId.");
  }
  return started.conversationId;
};

const recordRuntimeRequests = (
  calls: AiRuntimeRequest[],
  runtimeEvents: RuntimeEventsFactory,
): AiRuntimePort => ({
  streamEffect: (request) => {
    calls.push(request);
    return Stream.fromIterable(runtimeEvents(request, calls.length - 1));
  },
});

const visibleRuntimeRequests = (
  requests: readonly AiRuntimeRequest[],
): readonly AiRuntimeRequest[] =>
  requests.filter((request) => !request.requestId.endsWith(":conversation-title"));

const runtimeChatMessages = (request: AiRuntimeRequest | undefined) =>
  request?.messages.filter((message) => message.role !== "system") ?? [];

const createCompletedRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.STARTED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    providerId: request.providerId,
    modelId: request.modelId,
  },
  {
    type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    content: "Recorded history context.",
  },
  {
    type: RUNTIME_EVENT_TYPES.COMPLETED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 2,
    finishReason: RUNTIME_FINISH_REASONS.STOP,
  },
];

const createFailedRuntimeEvents = (request: AiRuntimeRequest): readonly RuntimeEvent[] => [
  {
    type: RUNTIME_EVENT_TYPES.STARTED,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 0,
    providerId: request.providerId,
    modelId: request.modelId,
  },
  {
    type: RUNTIME_EVENT_TYPES.ERROR,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence: 1,
    code: RUNTIME_ERROR_CODES.INTERNAL_ERROR,
    message: "configured runtime failed",
    retryable: false,
  },
];
