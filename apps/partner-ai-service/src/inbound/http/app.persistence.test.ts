import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import { hashCanonicalJson } from "@side-chat/partner-ai-core";
import { describe, expect, it } from "vitest";
import { createDevelopmentPartnerAiServiceApp, type PartnerAiServiceApp } from "./app.js";
import {
  readJsonResponseObject,
  requireJsonArray,
  requireJsonObject,
  requireString,
} from "#testing/json-response.test-support";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  runTurnStream,
  startedConversationId,
} from "#testing/turn-stream/turn-stream-harness.test-support";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_001",
  message: { id: "message_001", content: "hello service" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
    metadata: { tenantId: "not-authoritative" },
  },
};

const authHeaders = { authorization: "Bearer local-test-token" } as const;

const createApp = (repositories: MemorySidechatRepositories): PartnerAiServiceApp =>
  createDevelopmentPartnerAiServiceApp({
    repositories,
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
  });

describe("partner ai service streaming persistence", () => {
  it("creates distinct conversations for separate fresh stream requests", async () => {
    const repositories = createMemorySidechatRepositories();
    const app = createApp(repositories);

    await runTurnStream(app, {
      ...validRequest,
      requestId: "request_001",
      message: { id: "message_001", content: "hello service" },
    });
    await runTurnStream(app, {
      ...validRequest,
      requestId: "request_002",
      message: { id: "message_002", content: "hello service" },
    });

    const conversationIds = repositories
      .snapshot()
      .conversations.map((conversation) => conversation.conversationId);
    expect(conversationIds).toHaveLength(2);
    expect(new Set(conversationIds).size).toBe(2);
  });

  it("persists explicit conversation state and assigns the request message role", async () => {
    const repositories = createMemorySidechatRepositories();
    const app = createApp(repositories);
    const persistedRequest = { ...validRequest, conversationId: "conversation_explicit_1" };

    // The same request id is idempotent: the second run returns the existing turn
    // without forking a second generation, so durable state stays single.
    await runTurnStream(app, persistedRequest);
    await waitForCompletedTurn(repositories, persistedRequest.requestId);
    await runTurnStream(app, persistedRequest);
    await waitForCompletedTurn(repositories, persistedRequest.requestId);
    await waitForGeneratedTitle(repositories);

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
    const { events } = await runTurnStream(createApp(repositories), validRequest);
    const conversationId = startedConversationId(events);
    const restartedApp = createApp(repositories);

    await expect((await restartedApp.request("/healthz")).json()).resolves.toMatchObject({
      persistence: "memory",
      capabilities: {
        persistence: { adapterId: "memory-sidechat-repositories", safeForProduction: false },
      },
    });
    await expect(readHistory(restartedApp, conversationId)).resolves.toEqual([
      "hello service",
      "Fake response: hello service",
    ]);

    const reset = await restartedApp.request(`/chat/history/${conversationId}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    expect(reset.status).toBe(200);
    await expect(readHistory(restartedApp, conversationId)).resolves.toEqual([]);
  });
});

/**
 * Poll until the forked generation has recorded a completed turn.
 *
 * The browser terminal arrives before the onExit finalizer writes the durable
 * status, so durable-state assertions wait on the repository, not the stream.
 */
const waitForCompletedTurn = async (
  repositories: MemorySidechatRepositories,
  requestId: string,
): Promise<void> => {
  await expect
    .poll(
      () =>
        repositories.snapshot().assistantTurns.find((turn) => turn.requestId === requestId)?.status,
    )
    .toBe("completed");
};

/** Poll until the post-success title job has written a generated title. */
const waitForGeneratedTitle = async (repositories: MemorySidechatRepositories): Promise<void> => {
  await expect
    .poll(() => repositories.snapshot().conversations[0]?.titleText)
    .toBe("Service greeting");
};

const readHistory = async (
  app: PartnerAiServiceApp,
  conversationId: string,
): Promise<readonly string[]> => {
  const response = await app.request(`/chat/history/${conversationId}`, { headers: authHeaders });
  expect(response.status).toBe(200);
  const history = await readJsonResponseObject(response);
  const messages = requireJsonArray(history["messages"], "history messages");
  return messages.map((message, index) => {
    const record = requireJsonObject(message, `history message ${index}`);
    return requireString(record["content"], `history message ${index} content`);
  });
};
