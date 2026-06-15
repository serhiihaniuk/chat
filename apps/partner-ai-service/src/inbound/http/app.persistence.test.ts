import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  decodeSseEvents,
} from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  hashCanonicalJson,
  type MemoryPolicy,
  type MemoryPort,
  type MemoryRecallInput,
  type MemoryRecord,
  type MemoryWriteCandidate,
  type MemoryWriteCandidateProposalInput,
  type MemoryWriteCandidateRecordInput,
  type RagContextCandidate,
  type RagRetrievalInput,
  type RagRetrieverPort,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "./app.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", role: "user", content: "hello service" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    metadata: { tenantId: "not-authoritative" },
  },
};

describe("partner ai service /chat/stream persistence", () => {
  it("creates distinct conversations for separate fresh stream requests", async () => {
    const repositories = createMemorySidechatRepositories();
    const app = createPartnerAiServiceApp({ repositories });
    const postFreshRequest = (requestId: string, messageId: string) =>
      app.request("/chat/stream", {
        method: "POST",
        headers: {
          authorization: "Bearer local-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...validRequest,
          requestId,
          message: { ...validRequest.message, id: messageId },
        }),
      });

    const first = await postFreshRequest("request_001", "message_001");
    const second = await postFreshRequest("request_002", "message_002");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await first.text();
    await second.text();

    const conversationIds = repositories
      .snapshot()
      .conversations.map((conversation) => conversation.conversationId);
    expect(conversationIds).toHaveLength(2);
    expect(new Set(conversationIds).size).toBe(2);
  });

  it("persists explicit conversation state idempotently without durable host-command results", async () => {
    const repositories = createMemorySidechatRepositories();
    const app = createPartnerAiServiceApp({ repositories });
    const persistedRequest = {
      ...validRequest,
      conversationId: "conversation_explicit_1",
    };
    const postValidRequest = () =>
      app.request("/chat/stream", {
        method: "POST",
        headers: {
          authorization: "Bearer local-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(persistedRequest),
      });
    const expectSuccessfulStream = async () => {
      const response = await postValidRequest();
      expect(response.status).toBe(200);
      await response.text();
    };

    await expectSuccessfulStream();
    await expectSuccessfulStream();

    const snapshot = repositories.snapshot();
    expect(snapshot.conversations).toHaveLength(1);
    expect(snapshot.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(snapshot.assistantTurns).toHaveLength(1);
    expect(snapshot.assistantTurns[0]).toMatchObject({
      requestId: persistedRequest.requestId,
      status: "completed",
      runtimeProfile: "default",
      modelProvider: "fake",
      modelId: "fake-echo",
    });
    expect(snapshot.contextSnapshots).toHaveLength(1);
    expect(snapshot.contextSnapshots[0]).toMatchObject({
      hostContextHash: hashCanonicalJson(persistedRequest.hostContext),
      capabilitiesHash: snapshot.assistantTurns[0]?.toolRegistryVersion,
      contextRedactedJson: expect.objectContaining({
        runtimeMessageSummary: {
          messageCount: 1,
          roles: ["user"],
          admittedHistoryMessageIds: [],
        },
      }),
    });
    expect(snapshot.contextSnapshots[0]?.contextRedactedJson).not.toHaveProperty("runtimeMessages");
    expect(snapshot.usageRecords).toHaveLength(1);
    expect(snapshot.auditEvents).toHaveLength(1);
    expect(snapshot.auditEvents[0]).toMatchObject({
      eventType: "sidechat.assistant_turn.completed",
      targetType: "assistant_turn",
      requestId: validRequest.requestId,
      metadataJson: {
        modelProvider: "fake",
        modelId: "fake-echo",
        finishReason: "stop",
        usageTotalTokens: 6,
      },
    });
    expect(snapshot.hostCommandResults).toHaveLength(0);
  });

  it("reads persisted history through a fresh app composition and honors reset boundaries", async () => {
    const repositories = createMemorySidechatRepositories();
    const firstApp = createPartnerAiServiceApp({ repositories });

    const stream = await firstApp.request("/chat/stream", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(validRequest),
    });
    const conversationId = readStartedConversationId(await stream.text());
    const restartedApp = createPartnerAiServiceApp({ repositories });

    await expect((await restartedApp.request("/healthz")).json()).resolves.toMatchObject({
      persistence: "memory",
      capabilities: {
        persistence: {
          adapterId: "memory-sidechat-repositories",
          safeForProduction: false,
        },
      },
    });
    await expect(readHistory(restartedApp, conversationId)).resolves.toEqual([
      "hello service",
      "Fake response: hello service",
    ]);

    const reset = await restartedApp.request(`/chat/history/${conversationId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(reset.status).toBe(200);
    await expect(readHistory(restartedApp, conversationId)).resolves.toEqual([]);
  });

  it("persists policy-allowed RAG candidates in the context snapshot", async () => {
    const repositories = createMemorySidechatRepositories();
    const retrievalInputs: RagRetrievalInput[] = [];
    const app = createPartnerAiServiceApp({
      repositories,
      retrievalSources: [docsSource],
      ragRetriever: createRagRetriever((input) => {
        retrievalInputs.push(input);
        return Effect.succeed([createRagCandidate()]);
      }),
    });

    const response = await app.request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(retrievalInputs[0]).toMatchObject({
      requestId: "request_001",
      userMessage: "hello service",
      allowedSourceIds: ["docs"],
    });
    expect(repositories.snapshot().contextSnapshots[0]?.contextRedactedJson).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          title: "Retrieved context",
          content: expect.stringContaining("Docs say hello service."),
        }),
      ]),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          candidateId: "rag_docs_service_1",
          sourceType: "retrieval_result",
          sourceId: "docs",
          provenance: {
            sourceId: "docs",
            label: "Docs result",
            url: "https://docs.example/service",
          },
        }),
      ]),
    });
  });

  it("recalls memory into context and records post-turn memory write candidates", async () => {
    const repositories = createMemorySidechatRepositories();
    const recallInputs: MemoryRecallInput[] = [];
    const proposalInputs: MemoryWriteCandidateProposalInput[] = [];
    const writeInputs: MemoryWriteCandidateRecordInput[] = [];
    const app = createPartnerAiServiceApp({
      repositories,
      memoryPolicy: userMemoryPolicy,
      memory: createMemoryPort({ recallInputs, proposalInputs, writeInputs }),
    });

    const response = await app.request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(recallInputs[0]).toMatchObject({
      requestId: "request_001",
      userMessage: "hello service",
      allowedScopes: ["user"],
    });
    expect(repositories.snapshot().contextSnapshots[0]?.contextRedactedJson).toMatchObject({
      sections: expect.arrayContaining([
        expect.objectContaining({
          title: "Memory",
          content: expect.stringContaining("User prefers concise answers."),
        }),
      ]),
      candidates: expect.arrayContaining([
        expect.objectContaining({
          candidateId: "memory_memory_user_service_1",
          sourceType: "memory",
          sourceId: "memory_user_service_1",
        }),
      ]),
    });
    expect(proposalInputs[0]).toMatchObject({
      requestId: "request_001",
      assistantContent: expect.stringContaining("hello service"),
      allowedScopes: ["user"],
    });
    expect(writeInputs[0]).toMatchObject({
      candidates: [expect.objectContaining({ candidateId: "memory_write_user_service_1" })],
    });
  });
});

const authHeaders = () => ({
  authorization: "Bearer local-test-token",
  "content-type": "application/json",
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

const readHistory = async (
  app: ReturnType<typeof createPartnerAiServiceApp>,
  conversationId: string,
): Promise<readonly string[]> => {
  const response = await app.request(`/chat/history/${conversationId}`, {
    headers: authHeaders(),
  });
  expect(response.status).toBe(200);
  const history = (await response.json()) as {
    readonly messages: readonly { readonly content: string }[];
  };
  return history.messages.map((message) => message.content);
};

const userMemoryPolicy: MemoryPolicy = {
  policyId: "user_memory",
  mode: "read_write",
  scopes: ["user"],
};

const docsSource: RetrievalSourceCapability = {
  sourceId: "docs",
  description: "Product documentation.",
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
};

const createRagRetriever = (retrieve: RagRetrieverPort["retrieve"]): RagRetrieverPort => ({
  retrieve,
});

const createRagCandidate = (): RagContextCandidate => ({
  candidateId: "rag_docs_service_1",
  sourceId: "docs",
  title: "Docs result",
  content: "Docs say hello service.",
  url: "https://docs.example/service",
  score: 0.91,
  estimatedTokens: 9,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
});

const createMemoryPort = ({
  recallInputs,
  proposalInputs,
  writeInputs,
}: {
  readonly recallInputs: MemoryRecallInput[];
  readonly proposalInputs: MemoryWriteCandidateProposalInput[];
  readonly writeInputs: MemoryWriteCandidateRecordInput[];
}): MemoryPort => ({
  recall: (input) =>
    Effect.sync(() => {
      recallInputs.push(input);
      return [createMemoryRecord()];
    }),
  proposeWriteCandidates: (input) =>
    Effect.sync(() => {
      proposalInputs.push(input);
      return [createMemoryWriteCandidate(input.assistantTurnId)];
    }),
  writeCandidates: (input) =>
    Effect.sync(() => {
      writeInputs.push(input);
    }),
});

const createMemoryRecord = (): MemoryRecord => ({
  memoryId: "memory_user_service_1",
  scope: "user",
  content: "User prefers concise answers.",
  confidence: 0.93,
  updatedAt: "2026-05-23T12:00:00.000Z",
});

const createMemoryWriteCandidate = (assistantTurnId: string): MemoryWriteCandidate => ({
  candidateId: "memory_write_user_service_1",
  scope: "user",
  content: "User greeted the service.",
  reason: "Deterministic test memory candidate.",
  confidence: 0.8,
  sourceTurnId: assistantTurnId,
});
