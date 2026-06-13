import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  hashCanonicalJson,
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
        runtimeMessages: [{ role: "user", content: "hello service" }],
      }),
    });
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
});

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
