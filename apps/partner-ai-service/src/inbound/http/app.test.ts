import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
import type { ObservabilityRecord } from "@side-chat/partner-ai-core";
import { createMemorySidechatRepositories } from "@side-chat/db";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp, type PartnerAiServiceApp } from "./app.js";
import {
  TEST_SAFETY_POLL_INTERVAL_MS,
  runTurnStream,
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
const jsonHeaders = { ...authHeaders, "content-type": "application/json" } as const;

const createApp = (
  options: Parameters<typeof createPartnerAiServiceApp>[0] = {},
): PartnerAiServiceApp =>
  createPartnerAiServiceApp({
    resumability: { safetyPollIntervalMs: TEST_SAFETY_POLL_INTERVAL_MS },
    ...options,
  });

describe("partner ai service streaming path", () => {
  it("exposes day-one model, history, and usage routes", async () => {
    const app = createApp();

    await expect(
      (await app.request("/models", { headers: authHeaders })).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      defaultModel: { providerId: "fake", modelId: "fake-echo" },
      models: [{ providerId: "fake", modelId: "fake-echo" }],
    });

    const { conversationId } = await runTurnStream(app, validRequest);

    // The browser-visible terminal arrives before the onExit finalizer runs the
    // post-success title job, so poll until the durable title is generated.
    await expect.poll(() => readConversationTitle(app, conversationId)).toBe("Service greeting");

    await expect(
      (await app.request(`/chat/history/${conversationId}`, { headers: authHeaders })).json(),
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

  it("replays sidechat.v1 events from the durable log for authorized requests", async () => {
    const { events } = await runTurnStream(createApp(), validRequest);

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        SIDECHAT_EVENT_TYPES.STARTED,
        SIDECHAT_EVENT_TYPES.ACTIVITY,
        SIDECHAT_EVENT_TYPES.DELTA,
        SIDECHAT_EVENT_TYPES.COMPLETED,
      ]),
    );
    expect(events.at(0)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.STARTED, sequence: 0 });
    expect(events.at(-1)).toMatchObject({ type: SIDECHAT_EVENT_TYPES.COMPLETED });
  });

  it("streams through the runtime configured by service composition", async () => {
    const { events } = await runTurnStream(
      createApp({ runtime: { provider: "fake", modelId: "fake-custom" } }),
      validRequest,
    );

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
    await runTurnStream(
      createApp({ repositories, runtime: { provider: "fake", modelId: "fake-custom" } }),
      validRequest,
    );

    expect(repositories.snapshot().assistantTurns[0]).toMatchObject({
      runtimeProfile: "default",
      modelProvider: "fake",
      modelId: "fake-custom",
    });
  });

  it("maps malformed requests to stable bad_request errors", async () => {
    const response = await createApp().request("/chat/runs", {
      method: "POST",
      headers: jsonHeaders,
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
    const response = await createApp().request("/chat/runs", {
      method: "POST",
      headers: jsonHeaders,
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

  it("proves the response-owned POST /chat/stream path is gone", async () => {
    const response = await createApp().request("/chat/stream", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(validRequest),
    });

    expect(response.status).toBe(404);
  });

  it("fails closed for unauthenticated history and usage routes", async () => {
    const app = createApp();

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
  });

  it("resets conversation history through the public route", async () => {
    const app = createApp();
    const { conversationId } = await runTurnStream(app, validRequest);

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
      (await app.request(`/chat/history/${conversationId}`, { headers: authHeaders })).json(),
    ).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversationId,
      messages: [],
    });
  });

  it("fails closed when normalized auth cannot be extracted", async () => {
    const response = await createApp().request("/chat/runs", {
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
          workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
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
          workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
        },
      }),
    ).toThrow("Development static auth cannot");
  });

  it("denies cross-tenant production auth before persistence or model work", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createApp({
      repositories,
      workspace: { tenantId: "tenant_expected", workspaceId: "workspace_expected" },
      auth: {
        profile: "production",
        trustedBearerToken: "Bearer production-token",
        workspace: { tenantId: "tenant_other", workspaceId: "workspace_expected" },
      },
    }).request("/chat/runs", {
      method: "POST",
      headers: { authorization: "Bearer production-token", "content-type": "application/json" },
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
          workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
        },
        policies: { profile: "production", mode: "allow_all" },
      }),
    ).toThrow("Production policy cannot use");
  });

  it("maps production model policy denials before persistence or model work", async () => {
    const repositories = createMemorySidechatRepositories();
    const response = await createApp({
      repositories,
      auth: {
        profile: "production",
        trustedBearerToken: "Bearer production-token",
        workspace: { tenantId: "tenant_local", workspaceId: "workspace_local" },
      },
      policies: { profile: "production", mode: "configured", allowedModels: [] },
    }).request("/chat/runs", {
      method: "POST",
      headers: { authorization: "Bearer production-token", "content-type": "application/json" },
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
    const app = createApp({
      observability: { record: (record) => Effect.sync(() => records.push(record)) },
    });

    const response = await app.request("/chat/runs", {
      method: "POST",
      headers: { ...jsonHeaders, "x-trace-id": "trace-service-1" },
      body: JSON.stringify(validRequest),
    });
    expect(response.status).toBe(200);
    // Drain the POST's SSE body so the subscriber releases cleanly.
    await response.text();

    // The completed observation is recorded by the onExit finalizer, after the
    // browser terminal, so poll the captured records until it lands.
    await expect
      .poll(() => records.map((record) => record.lifecycleState))
      .toEqual(expect.arrayContaining(["received", "started", "runtime_event", "completed"]));
    expect(records.every((record) => record.traceId === "trace-service-1")).toBe(true);
  });
});

/** Read one conversation's current title through the list route. */
const readConversationTitle = async (
  app: PartnerAiServiceApp,
  conversationId: string,
): Promise<string | undefined> => {
  const response = await app.request("/chat/conversations?limit=10", { headers: authHeaders });
  const body = (await response.json()) as {
    readonly conversations: readonly { readonly conversationId: string; readonly title: string }[];
  };
  return body.conversations.find((entry) => entry.conversationId === conversationId)?.title;
};

const productionPersistence = {
  kind: "postgres" as const,
  databaseUrl: "postgres://sidechat:sidechat@localhost/sidechat",
};
