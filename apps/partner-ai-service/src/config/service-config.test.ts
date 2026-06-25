import { SIDECHAT_EVENT_TYPES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { RESUMABILITY_DEFAULTS } from "#config/catalog/config-values";
import { createPartnerAiServiceApp } from "#inbound/http/app";
import { runTurnStream } from "#testing/turn-stream/turn-stream-harness.test-support";
import {
  ServiceConfigError,
  createPartnerAiServiceOptionsFromEnv,
  readDemoSeedConversations,
  readServicePort,
} from "./service-config.js";

const validRequest = {
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: "request_config_001",
  message: { id: "message_config_001", content: "hello infra" },
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
        SIDECHAT_SAFETY_POLL_INTERVAL_MS: "10",
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

    const { events } = await runTurnStream(app, validRequest, "Bearer local-compose-token");
    expect(events.at(-1)).toMatchObject({
      type: SIDECHAT_EVENT_TYPES.COMPLETED,
    });
  });

  it("maps production env to explicit auth and configured model policy", async () => {
    const app = createPartnerAiServiceApp(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "production",
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "prod-key",
        SIDECHAT_AUTH_BEARER_TOKEN: "prod-token",
        SIDECHAT_POLICY_MODE: "configured",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini,other-model",
        SIDECHAT_TENANT_ID: "tenant_prod",
        SIDECHAT_WORKSPACE_ID: "workspace_prod",
        SIDECHAT_DATABASE_URL: "postgres://sidechat:sidechat@localhost/sidechat",
      }),
    );

    const readiness = await app.request("/readyz");
    await expect(readiness.json()).resolves.toMatchObject({
      authProfile: "production",
      policyMode: "configured",
      providerId: "openai",
      modelId: "gpt-5.4-mini",
    });
  });

  it("rejects fake provider and dev tools in production", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "production",
        SIDECHAT_DATABASE_URL: "postgres://sidechat:sidechat@localhost/sidechat",
      }),
    ).toThrow("SIDECHAT_PROVIDER=openai");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "production",
        SIDECHAT_PROVIDER: "fake",
        SIDECHAT_DATABASE_URL: "postgres://sidechat:sidechat@localhost/sidechat",
      }),
    ).toThrow("SIDECHAT_PROVIDER=openai");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROFILE: "production",
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_DATABASE_URL: "postgres://sidechat:sidechat@localhost/sidechat",
        SIDECHAT_ENABLE_DEV_TOOLS: "true",
      }),
    ).toThrow("SIDECHAT_ENABLE_DEV_TOOLS");
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

  it("parses demo conversation seeding as an explicit local opt-in", () => {
    expect(readDemoSeedConversations({})).toBe(false);
    expect(readDemoSeedConversations({ SIDECHAT_DEMO_SEED_CONVERSATIONS: "true" })).toBe(true);
    expect(readDemoSeedConversations({ SIDECHAT_DEMO_SEED_CONVERSATIONS: "false" })).toBe(false);
    expect(() =>
      readDemoSeedConversations({
        SIDECHAT_DEMO_SEED_CONVERSATIONS: "sometimes",
      }),
    ).toThrow(ServiceConfigError);
  });

  it("maps OpenAI env to runtime provider config", () => {
    expect(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini,gpt-5.5-mini",
        SIDECHAT_MODEL_CONTEXT_WINDOWS: "gpt-5.5-mini:1000000",
        SIDECHAT_OPENAI_REASONING_EFFORT: "medium",
        SIDECHAT_OPENAI_REASONING_EFFORTS: "low,medium,high",
        SIDECHAT_OPENAI_REASONING_SUMMARY: "auto",
      }).runtime,
    ).toMatchObject({
      provider: "openai",
      apiKey: "key_123",
      modelIds: ["gpt-5.4-mini", "gpt-5.5-mini"],
      defaultModelId: "gpt-5.4-mini",
      modelMetadata: [
        {
          modelId: "gpt-5.4-mini",
          displayName: "GPT-5.4 mini",
          contextWindowTokens: 400_000,
          maxOutputTokens: 128_000,
        },
        {
          modelId: "gpt-5.5-mini",
          displayName: "GPT-5.5 mini",
          contextWindowTokens: 1_000_000,
        },
      ],
      enableMockWebSearch: true,
      reasoningEffort: "medium",
      reasoningEfforts: ["low", "medium", "high"],
      reasoningSummary: "auto",
    });
  });

  it("maps implemented capability env to history and context budgets", () => {
    const options = createPartnerAiServiceOptionsFromEnv({
      SIDECHAT_HISTORY_MODE: "recent_messages",
      SIDECHAT_HISTORY_MAX_MESSAGES: "8",
      SIDECHAT_HISTORY_MAX_TOKENS: "1200",
      SIDECHAT_CONTEXT_MAX_INPUT_TOKENS: "12000",
      SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS: "2000",
      SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS: "1500",
    });

    expect(options.capabilities).toMatchObject({
      history: {
        mode: "recent_messages",
        maxMessages: 8,
        maxTokens: 1200,
      },
      contextAdmission: {
        policyId: "deterministic_v1",
        maxInputTokens: 12000,
        reservedOutputTokens: 2000,
        maxHistoryTokens: 1500,
      },
    });
  });

  it("resolves resumability lease and retention tunables from env with safe defaults", () => {
    const overridden = createPartnerAiServiceOptionsFromEnv({
      SIDECHAT_INSTANCE_ID: "instance_pod_7",
      SIDECHAT_LEASE_TTL_MS: "45000",
      SIDECHAT_HEARTBEAT_INTERVAL_MS: "12000",
      SIDECHAT_REAPER_INTERVAL_MS: "20000",
      SIDECHAT_REAPER_BATCH_LIMIT: "25",
      SIDECHAT_TURN_EVENT_RETENTION_MS: "60000",
      SIDECHAT_PRUNER_INTERVAL_MS: "30000",
    });
    expect(overridden.resumability).toMatchObject({
      instanceId: "instance_pod_7",
      leaseTtlMs: 45000,
      heartbeatIntervalMs: 12000,
      reaperIntervalMs: 20000,
      reaperBatchLimit: 25,
      turnEventRetentionMs: 60000,
      prunerIntervalMs: 30000,
    });

    // Absent env falls back to the catalog defaults, with a stable per-process id.
    const defaults = createPartnerAiServiceOptionsFromEnv({});
    expect(defaults.resumability).toMatchObject({
      leaseTtlMs: RESUMABILITY_DEFAULTS.LEASE_TTL_MS,
      heartbeatIntervalMs: RESUMABILITY_DEFAULTS.HEARTBEAT_INTERVAL_MS,
      reaperIntervalMs: RESUMABILITY_DEFAULTS.REAPER_INTERVAL_MS,
      reaperBatchLimit: RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT,
      turnEventRetentionMs: RESUMABILITY_DEFAULTS.TURN_EVENT_RETENTION_MS,
      prunerIntervalMs: RESUMABILITY_DEFAULTS.PRUNER_INTERVAL_MS,
    });
    expect(defaults.resumability?.instanceId).toBeTruthy();
  });

  it("rejects a non-positive resumability duration", () => {
    expect(() => createPartnerAiServiceOptionsFromEnv({ SIDECHAT_LEASE_TTL_MS: "0" })).toThrow(
      "SIDECHAT_LEASE_TTL_MS",
    );
  });

  it("rejects a non-positive reaper batch limit", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_REAPER_BATCH_LIMIT: "0",
      }),
    ).toThrow("SIDECHAT_REAPER_BATCH_LIMIT");
  });

  it("rejects unsupported capability env config", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_CONTEXT_MAX_INPUT_TOKENS: "1000",
        SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS: "1000",
      }),
    ).toThrow("SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_HISTORY_MODE: "summary_history",
      }),
    ).toThrow("SIDECHAT_HISTORY_MODE");
  });

  it("rejects unsupported OpenAI reasoning options", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_OPENAI_REASONING_EFFORT: "very-hard",
      }),
    ).toThrow("SIDECHAT_OPENAI_REASONING_EFFORT");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_OPENAI_REASONING_SUMMARY: "verbose",
      }),
    ).toThrow("SIDECHAT_OPENAI_REASONING_SUMMARY");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_OPENAI_REASONING_EFFORT: "high",
        SIDECHAT_OPENAI_REASONING_EFFORTS: "low,medium",
      }),
    ).toThrow("SIDECHAT_OPENAI_REASONING_EFFORT must be included");
  });

  it("rejects malformed model context window env config", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_MODEL_CONTEXT_WINDOWS: "gpt-5.4-mini:not-a-number",
      }),
    ).toThrow("SIDECHAT_MODEL_CONTEXT_WINDOWS");
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
