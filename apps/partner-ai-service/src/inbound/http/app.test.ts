import {
  decodeSseEvents,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
import type { ObservabilityRecord } from "@side-chat/partner-ai-core";
import { createMemorySidechatRepositories } from "@side-chat/db";
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

describe("partner ai service /chat/stream", () => {
  it("exposes day-one model, history, and usage routes", async () => {
    const app = createPartnerAiServiceApp();
    const authHeaders = { authorization: "Bearer local-test-token" };

    await expect(
      (await app.request("/models", { headers: authHeaders })).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      models: [{ providerId: "fake", modelId: "fake-echo" }],
    });

    const stream = await app.request("/chat/stream", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });
    const streamedEvents = decodeSseEvents(await stream.text());
    const conversationId = streamedEvents.find(
      (event) => event.type === "sidechat.started",
    )?.conversationId;

    await expect(
      (
        await app.request(`/chat/history/${conversationId}`, {
          headers: authHeaders,
        })
      ).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversationId,
      messages: [
        { role: "user", content: "hello service", sequence: 0 },
        { role: "assistant", content: "Fake response: hello service" },
      ],
    });

    await expect(
      (await app.request("/usage", { headers: authHeaders })).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      inputTokens: 1,
      outputTokens: 3,
      totalTokens: 4,
    });
  });

  it("returns sidechat.v1 SSE for authorized requests", async () => {
    const response = await createPartnerAiServiceApp().request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = decodeSseEvents(await response.text());
    expect(events.map((event) => event.type)).toEqual([
      "sidechat.started",
      "sidechat.reasoning",
      "sidechat.delta",
      "sidechat.completed",
    ]);
    expect(events.at(-1)).toMatchObject({ type: "sidechat.completed" });
  });

  it("maps malformed requests to stable bad_request errors", async () => {
    const response = await createPartnerAiServiceApp().request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ protocolVersion: "sidechat.v2" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: "bad_request",
      retryable: false,
    });
  });

  it("fails closed when normalized auth cannot be extracted", async () => {
    const response = await createPartnerAiServiceApp().request("/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: "unauthorized",
      retryable: false,
    });
  });

  it("refuses production boot without a real authority adapter", () => {
    expect(() =>
      createPartnerAiServiceApp({
        persistence: productionPersistence,
        auth: {
          profile: "production",
          workspace: {
            tenantId: "tenant_local",
            workspaceId: "workspace_local",
          },
        },
      }),
    ).toThrow("Production auth requires");
  });

  it("keeps static dev auth out of the production profile", () => {
    expect(() =>
      createPartnerAiServiceApp({
        persistence: productionPersistence,
        auth: {
          profile: "production",
          trustedBearerToken: "Bearer local-test-token",
          workspace: {
            tenantId: "tenant_local",
            workspaceId: "workspace_local",
          },
        },
      }),
    ).toThrow("Development static auth cannot");
  });

  it("denies cross-tenant production auth before persistence or model work", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createPartnerAiServiceApp({
      repositories,
      workspace: {
        tenantId: "tenant_expected",
        workspaceId: "workspace_expected",
      },
      auth: {
        profile: "production",
        trustedBearerToken: "Bearer production-token",
        workspace: {
          tenantId: "tenant_other",
          workspaceId: "workspace_expected",
        },
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer production-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(403);
    expect(repositories.snapshot()).toMatchObject({
      conversations: [],
      messages: [],
      assistantTurns: [],
      usageRecords: [],
    });
  });

  it("refuses production allow-all policy configuration", () => {
    expect(() =>
      createPartnerAiServiceApp({
        persistence: productionPersistence,
        auth: {
          profile: "production",
          trustedBearerToken: "Bearer production-token",
          workspace: {
            tenantId: "tenant_local",
            workspaceId: "workspace_local",
          },
        },
        policies: { profile: "production", mode: "allow_all" },
      }),
    ).toThrow("Production policy cannot use");
  });

  it("maps production model policy denials before persistence or model work", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createPartnerAiServiceApp({
      repositories,
      auth: {
        profile: "production",
        trustedBearerToken: "Bearer production-token",
        workspace: {
          tenantId: "tenant_local",
          workspaceId: "workspace_local",
        },
      },
      policies: {
        profile: "production",
        mode: "configured",
        allowedModels: [],
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer production-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: "forbidden",
      retryable: false,
    });
    expect(repositories.snapshot()).toMatchObject({
      conversations: [],
      messages: [],
      assistantTurns: [],
      usageRecords: [],
    });
  });

  it("passes request trace correlation into stream observability", async () => {
    const records: ObservabilityRecord[] = [];
    const response = await createPartnerAiServiceApp({
      observability: {
        record: (record) => {
          records.push(record);
        },
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
        "x-trace-id": "trace-service-1",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(records.map((record) => record.lifecycleState)).toEqual([
      "received",
      "started",
      "runtime_event",
      "runtime_event",
      "runtime_event",
      "completed",
    ]);
    expect(
      records.every((record) => record.traceId === "trace-service-1"),
    ).toBe(true);
  });

  it("persists conversation state idempotently without durable host-command results", async () => {
    const repositories = createMemorySidechatRepositories();
    const app = createPartnerAiServiceApp({ repositories });
    const postValidRequest = () =>
      app.request("/chat/stream", {
        method: "POST",
        headers: {
          authorization: "Bearer local-test-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(validRequest),
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
    expect(snapshot.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ]);
    expect(snapshot.assistantTurns).toHaveLength(1);
    expect(snapshot.assistantTurns[0]).toMatchObject({
      requestId: validRequest.requestId,
      status: "completed",
      runtimeProfile: "fake",
      modelProvider: "fake",
      modelId: "fake-echo",
    });
    expect(snapshot.contextSnapshots).toHaveLength(1);
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
        usageTotalTokens: 4,
      },
    });
    expect(snapshot.hostCommandResults).toHaveLength(0);
  });
});

const productionPersistence = {
  kind: "postgres" as const,
  databaseUrl: "postgres://sidechat:sidechat@localhost/sidechat",
};
