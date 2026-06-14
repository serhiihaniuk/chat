import { decodeSseEvents, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { RESEARCH_CONTEXT_AGENT_ID } from "@side-chat/partner-ai-core";
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

  it("maps OpenAI env to runtime provider config", () => {
    expect(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_PROVIDER: "openai",
        SIDECHAT_OPENAI_API_KEY: "key_123",
        SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
        SIDECHAT_OPENAI_REASONING_EFFORT: "medium",
        SIDECHAT_OPENAI_REASONING_SUMMARY: "auto",
      }).runtime,
    ).toMatchObject({
      provider: "openai",
      apiKey: "key_123",
      modelIds: ["gpt-5.4-mini"],
      defaultModelId: "gpt-5.4-mini",
      enableMockWebSearch: true,
      reasoningEffort: "medium",
      reasoningSummary: "auto",
    });
  });

  it("maps capability env to manifest declarations and context budgets", () => {
    const options = createPartnerAiServiceOptionsFromEnv({
      SIDECHAT_MEMORY_MODE: "noop",
      SIDECHAT_MEMORY_AUTO_WRITE: "auto_apply",
      SIDECHAT_MEMORY_DEFAULT_SCOPE: "workspace",
      SIDECHAT_RAG_MODE: "noop",
      SIDECHAT_RAG_SOURCES: "docs,tickets",
      SIDECHAT_RAG_FAILURE_MODE: "fail_turn",
      SIDECHAT_RESEARCH_MODE: "noop",
      SIDECHAT_RESEARCH_FAILURE_MODE: "fail_turn",
      SIDECHAT_HISTORY_MODE: "recent_messages",
      SIDECHAT_HISTORY_MAX_MESSAGES: "8",
      SIDECHAT_HISTORY_MAX_TOKENS: "1200",
      SIDECHAT_CONTEXT_MAX_INPUT_TOKENS: "12000",
      SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS: "2000",
      SIDECHAT_CONTEXT_MAX_HISTORY_TOKENS: "1500",
      SIDECHAT_CONTEXT_MAX_MEMORY_TOKENS: "900",
      SIDECHAT_CONTEXT_MAX_RAG_TOKENS: "4000",
      SIDECHAT_CONTEXT_MAX_RESEARCH_TOKENS: "1600",
    });

    expect(options.memoryPolicy).toEqual({
      policyId: "configured_workspace_memory",
      mode: "read_write",
      scopes: ["workspace"],
    });
    expect(options.retrievalSources).toEqual([
      {
        sourceId: "docs",
        description: "Configured retrieval source docs.",
        trustLevel: "trusted_host",
      },
      {
        sourceId: "tickets",
        description: "Configured retrieval source tickets.",
        trustLevel: "trusted_host",
      },
    ]);
    expect(options.researchAgents).toEqual([
      {
        researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
        description: "Configured pre-answer research agent.",
      },
    ]);
    expect(options.capabilities).toMatchObject({
      memory: {
        mode: "noop",
        autoWrite: "auto_apply",
        defaultScope: "workspace",
      },
      rag: {
        mode: "noop",
        sourceIds: ["docs", "tickets"],
        failureMode: "fail_turn",
      },
      research: {
        mode: "noop",
        failureMode: "fail_turn",
      },
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
        maxMemoryTokens: 900,
        maxRagTokens: 4000,
        maxResearchTokens: 1600,
      },
    });
  });

  it("rejects ambiguous capability env config", () => {
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_RAG_MODE: "noop",
      }),
    ).toThrow("SIDECHAT_RAG_SOURCES is required");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_RAG_MODE: "noop",
        SIDECHAT_RAG_SOURCES: "docs,docs",
      }),
    ).toThrow("duplicate capability id docs");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_MEMORY_MODE: "sometimes",
      }),
    ).toThrow("SIDECHAT_MEMORY_MODE");
    expect(() =>
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_CONTEXT_MAX_INPUT_TOKENS: "1000",
        SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS: "1000",
      }),
    ).toThrow("SIDECHAT_CONTEXT_RESERVED_OUTPUT_TOKENS");
  });

  it("rejects production-like configured capabilities without concrete adapters", () => {
    expect(() =>
      createPartnerAiServiceApp(
        createPartnerAiServiceOptionsFromEnv({
          ...productionOpenAiEnv,
          SIDECHAT_MEMORY_MODE: "noop",
        }),
      ),
    ).toThrow("memory");
    expect(() =>
      createPartnerAiServiceApp(
        createPartnerAiServiceOptionsFromEnv({
          ...productionOpenAiEnv,
          SIDECHAT_RAG_MODE: "noop",
          SIDECHAT_RAG_SOURCES: "docs",
        }),
      ),
    ).toThrow("rag");
    expect(() =>
      createPartnerAiServiceApp(
        createPartnerAiServiceOptionsFromEnv({
          ...productionOpenAiEnv,
          SIDECHAT_RESEARCH_MODE: "noop",
        }),
      ),
    ).toThrow("research");
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

const productionOpenAiEnv = {
  SIDECHAT_PROFILE: "production",
  SIDECHAT_PROVIDER: "openai",
  SIDECHAT_OPENAI_API_KEY: "prod-key",
  SIDECHAT_ALLOWED_MODELS: "gpt-5.4-mini",
  SIDECHAT_DATABASE_URL: "postgres://sidechat:sidechat@localhost/sidechat",
} as const;
