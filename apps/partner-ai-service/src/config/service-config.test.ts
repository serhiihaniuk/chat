import {
  decodeSseEvents,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "../http/app.js";
import {
  ServiceConfigError,
  createPartnerAiServiceOptionsFromEnv,
  readServicePort,
} from "./service-config.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_config_001",
  message: { id: "message_config_001", role: "user", content: "hello infra" },
  hostContext: {
    schemaVersion: "host.v1",
    origin: "https://host.example",
  },
};

describe("partner ai service env config", () => {
  it("keeps the local fake-provider path runnable without real credentials", async () => {
    const app = createPartnerAiServiceApp(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_AUTH_BEARER_TOKEN: "local-compose-token",
      }),
    );

    const health = await app.request("/healthz");
    await expect(health.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      status: "ok",
      service: "partner-ai-service",
      authProfile: "development",
      policyMode: "allow_all",
      providerId: "fake",
      modelId: "fake-echo",
      persistence: "memory",
      hostCommandResults: "disabled",
    });

    const stream = await app.request("/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer local-compose-token",
        "content-type": "application/json",
      },
      body: JSON.stringify(validRequest),
    });

    expect(stream.status).toBe(200);
    const events = decodeSseEvents(await stream.text());
    expect(events.at(-1)).toMatchObject({ type: "sidechat.completed" });
  });

  it("maps production env to explicit auth and configured model policy", async () => {
    const app = createPartnerAiServiceApp(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "production",
        SIDECHAT_AUTH_BEARER_TOKEN: "prod-token",
        SIDECHAT_POLICY_MODE: "configured",
        SIDECHAT_ALLOWED_MODELS: "fake-echo,other-model",
        SIDECHAT_TENANT_ID: "tenant_prod",
        SIDECHAT_WORKSPACE_ID: "workspace_prod",
      }),
    );

    const readiness = await app.request("/readyz");
    await expect(readiness.json()).resolves.toMatchObject({
      authProfile: "production",
      policyMode: "configured",
      providerId: "fake",
      modelId: "fake-echo",
    });
  });

  it("validates operational profile and port inputs", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "staging",
      }),
    ).toThrow(ServiceConfigError);
    expect(() => readServicePort({ PORT: "abc" })).toThrow(ServiceConfigError);
    expect(readServicePort({ PORT: "8788" })).toBe(8788);
  });
});
