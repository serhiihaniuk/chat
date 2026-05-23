import {
  decodeSseEvents,
  SIDECHAT_PROTOCOL_VERSION,
} from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "#inbound/http/app";
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
        SIDECHAT_DATABASE_URL:
          "postgres://sidechat:sidechat@localhost/sidechat",
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

  it("maps OpenAI env to runtime provider config", () => {
    expect(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5-mini,gpt-5",
      }).runtime,
    ).toMatchObject({
      provider: "openai",
      apiKey: "key_123",
      modelIds: ["gpt-5-mini", "gpt-5"],
      defaultModelId: "gpt-5-mini",
    });
  });

  it("rejects OpenAI provider config without credentials or allowed models", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
      }),
    ).toThrow("SIDECHAT_OPENAI_API_KEY is required");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
      }),
    ).toThrow("SIDECHAT_ALLOWED_MODELS is required");
  });
});
