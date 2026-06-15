import {
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  decodeSseEvents,
} from "@side-chat/chat-protocol";
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
    expect(snapshot.conversations[0]?.titleText).toBe("Service greeting");
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
