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
