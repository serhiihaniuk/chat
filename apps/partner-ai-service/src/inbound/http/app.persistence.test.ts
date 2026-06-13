import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { hashCanonicalJson } from "@side-chat/partner-ai-core";
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
});
