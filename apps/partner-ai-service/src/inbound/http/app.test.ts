import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
  decodeSseEvents,
} from "@side-chat/chat-protocol";
import type { ObservabilityRecord } from "@side-chat/partner-ai-core";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "./app.js";

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

describe("partner ai service /chat/stream", () => {
  it("exposes day-one model, history, and usage routes", async () => {
    const app = createPartnerAiServiceApp();
    const authHeaders = { authorization: "Bearer local-test-token" };

    await expect(
      (await app.request("/models", { headers: authHeaders })).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      defaultModel: { providerId: "fake", modelId: "fake-echo" },
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
      (event) => event.type === SIDECHAT_EVENT_TYPES.STARTED,
    )?.conversationId;

    await expect(
      (
        await app.request("/chat/conversations?limit=10", {
          headers: authHeaders,
        })
      ).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversations: [{ conversationId, title: "Service greeting" }],
    });

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
      inputTokens: 2,
      outputTokens: 4,
      totalTokens: 6,
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
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        SIDECHAT_EVENT_TYPES.STARTED,
        SIDECHAT_EVENT_TYPES.ACTIVITY,
        SIDECHAT_EVENT_TYPES.DELTA,
        SIDECHAT_EVENT_TYPES.COMPLETED,
      ]),
    );
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("streams through the runtime configured by service composition", async () => {
    const response = await createPartnerAiServiceApp({
      runtime: {
        provider: "fake",
        modelId: "fake-custom",
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    const events = decodeSseEvents(await response.text());
    expect(events).toContainEqual(
      expect.objectContaining({
        type: SIDECHAT_EVENT_TYPES.ACTIVITY,
        activityKind: "reasoning",
        title: "Thinking (medium)",
      }),
    );
  });

  it("persists provider/model ids from the composed runtime", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createPartnerAiServiceApp({
      repositories,
      runtime: {
        provider: "fake",
        modelId: "fake-custom",
      },
    }).request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(200);
    await response.text();
    expect(repositories.snapshot().assistantTurns[0]).toMatchObject({
      runtimeProfile: "default",
      modelProvider: "fake",
      modelId: "fake-custom",
    });
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
      code: PROTOCOL_ERROR_CODES.BAD_REQUEST,
      retryable: false,
    });
  });

  it("maps invalid JSON bodies to stable bad_request errors", async () => {
    const response = await createPartnerAiServiceApp().request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-test-token",
        "content-type": "application/json",
      },
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.BAD_REQUEST,
      message: "Request body must be valid JSON.",
      retryable: false,
    });
  });

  it("fails closed for unauthenticated history and usage routes", async () => {
    const app = createPartnerAiServiceApp();

    const conversations = await app.request("/chat/conversations");
    const history = await app.request("/chat/history/conversation_1");
    const usage = await app.request("/usage");

    expect(conversations.status).toBe(401);
    expect(history.status).toBe(401);
    expect(usage.status).toBe(401);
    await expect(conversations.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    });
    await expect(history.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    });
    await expect(usage.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      code: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    });
  });

  it("resets conversation history through the public route", async () => {
    const app = createPartnerAiServiceApp();
    const authHeaders = { authorization: "Bearer local-test-token" };
    const stream = await app.request("/chat/stream", {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });
    const conversationId = decodeSseEvents(await stream.text()).find(
      (event) => event.type === SIDECHAT_EVENT_TYPES.STARTED,
    )?.conversationId;

    const reset = await app.request(`/chat/history/${conversationId}`, {
      method: "DELETE",
      headers: authHeaders,
    });

    expect(reset.status).toBe(200);
    await expect(reset.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversationId,
      status: "reset",
    });

    await expect(
      (
        await app.request(`/chat/history/${conversationId}`, {
          headers: authHeaders,
        })
      ).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversationId,
      messages: [],
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
      code: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
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
      code: PROTOCOL_ERROR_CODES.FORBIDDEN,
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
        record: (record) => Effect.sync(() => records.push(record)),
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
    expect(records.map((record) => record.lifecycleState)).toEqual(
      expect.arrayContaining(["received", "started", "runtime_event", "completed"]),
    );
    expect(records.every((record) => record.traceId === "trace-service-1")).toBe(true);
  });
});

const productionPersistence = {
  kind: "postgres" as const,
  databaseUrl: "postgres://sidechat:sidechat@localhost/sidechat",
};
