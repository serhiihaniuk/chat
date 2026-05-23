import {
  decodeSseEvents,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
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
    expect(snapshot.hostCommandResults).toHaveLength(0);
  });
});
