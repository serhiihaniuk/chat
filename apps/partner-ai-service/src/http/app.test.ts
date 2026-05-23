import {
  decodeSseEvents,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
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
});
