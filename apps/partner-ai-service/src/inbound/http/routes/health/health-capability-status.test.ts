import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import {
  CONTEXT_TRUST_LEVELS,
  RESEARCH_CONTEXT_AGENT_ID,
  type MemoryPolicy,
  type MemoryPort,
  type RagRetrieverPort,
  type ResearchAgentCapability,
  type ResearchAgentPort,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceOptionsFromEnv } from "#config/service-config";
import { createPartnerAiServiceApp } from "../../app.js";

describe("partner ai service capability diagnostics", () => {
  it("reports default disabled and no-op capabilities explicitly", async () => {
    const response = await createPartnerAiServiceApp().request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      service: "partner-ai-service",
      capabilities: {
        memory: {
          capability: "memory",
          state: "disabled",
          adapterId: "noop-memory-port",
          policyId: "no_memory",
          safeForProduction: true,
        },
        rag: {
          capability: "rag",
          state: "disabled",
          adapterId: "noop-rag-retriever",
          configuredSourceCount: 0,
          safeForProduction: true,
        },
        research: {
          capability: "research",
          state: "disabled",
          adapterId: "noop-research-agent",
          configuredAgentCount: 0,
          safeForProduction: true,
        },
        history: {
          capability: "history",
          state: "disabled",
          adapterId: "current-message-only-history-context",
          safeForProduction: true,
        },
        contextAdmission: {
          capability: "contextAdmission",
          state: "noop",
          adapterId: "simple-include-all-context-admission",
          policyId: "deterministic_v1",
          selectionMode: "include_all",
          recordedBudget: {
            maxInputTokens: 24_000,
            reservedOutputTokens: 4_000,
            sourceTokenBudgets: {
              history: 4_000,
              memory: 2_000,
              rag: 8_000,
              research: 4_000,
            },
          },
          safeForProduction: false,
        },
        persistence: {
          capability: "persistence",
          state: "configured",
          adapterId: "memory-sidechat-repositories",
          safeForProduction: false,
        },
      },
    });
  });

  it("reports env-configured no-op capabilities without leaking adapter details", async () => {
    const response = await createPartnerAiServiceApp(
      createPartnerAiServiceOptionsFromEnv({
        SIDECHAT_MEMORY_MODE: "noop",
        SIDECHAT_MEMORY_DEFAULT_SCOPE: "user",
        SIDECHAT_RAG_MODE: "noop",
        SIDECHAT_RAG_SOURCES: "docs",
        SIDECHAT_RESEARCH_MODE: "noop",
        SIDECHAT_HISTORY_MODE: "recent_plus_summary",
      }),
    ).request("/readyz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      capabilities: {
        memory: {
          state: "noop",
          adapterId: "noop-memory-port",
          policyId: "configured_user_memory",
          safeForProduction: false,
        },
        rag: {
          state: "noop",
          adapterId: "noop-rag-retriever",
          configuredSourceCount: 1,
          safeForProduction: false,
        },
        research: {
          state: "noop",
          adapterId: "noop-research-agent",
          configuredAgentCount: 1,
          safeForProduction: false,
        },
        history: {
          state: "noop",
          adapterId: "current-message-only-history-context",
          policyId: "recent_plus_summary",
          safeForProduction: false,
        },
        contextAdmission: {
          state: "noop",
          policyId: "deterministic_v1",
          selectionMode: "include_all",
        },
      },
    });
  });

  it("reports configured memory, RAG, and research adapters", async () => {
    const response = await createPartnerAiServiceApp({
      memoryPolicy: userMemoryPolicy,
      memory: createMemoryPort(),
      retrievalSources: [docsSource],
      ragRetriever: createRagRetriever(),
      researchAgents: [researchAgentCapability],
      researchAgent: createResearchAgent(),
    }).request("/readyz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      capabilities: {
        memory: {
          state: "configured",
          adapterId: "configured-memory-port",
          policyId: "user_memory",
          safeForProduction: true,
        },
        rag: {
          state: "configured",
          adapterId: "configured-rag-retriever",
          configuredSourceCount: 1,
          safeForProduction: true,
        },
        research: {
          state: "configured",
          adapterId: "configured-research-agent",
          configuredAgentCount: 1,
          safeForProduction: true,
        },
      },
    });
  });

  it("rejects production-profile enabled capabilities without concrete adapters", () => {
    expect(() =>
      createPartnerAiServiceApp({
        auth: productionAuth,
        persistence: productionPersistence,
        memoryPolicy: userMemoryPolicy,
      }),
    ).toThrow("Production profile requires concrete adapters for enabled capabilities: memory.");

    expect(() =>
      createPartnerAiServiceApp({
        auth: productionAuth,
        persistence: productionPersistence,
        retrievalSources: [docsSource],
      }),
    ).toThrow("Production profile requires concrete adapters for enabled capabilities: rag.");

    expect(() =>
      createPartnerAiServiceApp({
        auth: productionAuth,
        persistence: productionPersistence,
        researchAgents: [researchAgentCapability],
      }),
    ).toThrow("Production profile requires concrete adapters for enabled capabilities: research.");
  });

  it("omits secrets and private adapter details from diagnostics", async () => {
    const response = await createPartnerAiServiceApp({
      auth: productionAuth,
      policies: {
        profile: "production",
        mode: "configured",
        allowedModels: ["gpt-5.4-mini"],
      },
      persistence: {
        kind: "postgres",
        databaseUrl: "postgres://secret-user:secret-pass@db.example/sidechat",
      },
      runtime: {
        provider: "openai",
        apiKey: "sk-secret-diagnostics-key",
        modelIds: ["gpt-5.4-mini"],
        defaultModelId: "gpt-5.4-mini",
        baseUrl: "https://secret-provider.example/v1",
      },
    }).request("/readyz");
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(responseText).not.toContain("sk-secret-diagnostics-key");
    expect(responseText).not.toContain("secret-pass");
    expect(responseText).not.toContain("super-secret-token");
    expect(responseText).not.toContain("secret-provider.example");
    expect(JSON.parse(responseText)).toMatchObject({
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      capabilities: {
        persistence: {
          state: "configured",
          adapterId: "postgres-drizzle-sidechat-repositories",
          safeForProduction: true,
        },
      },
    });
  });
});

const userMemoryPolicy: MemoryPolicy = {
  policyId: "user_memory",
  mode: "read_write",
  scopes: ["user"],
};

const docsSource: RetrievalSourceCapability = {
  sourceId: "docs",
  description: "Workspace documentation.",
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
};

const researchAgentCapability: ResearchAgentCapability = {
  researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
  description: "Run pre-answer research.",
};

const productionAuth = {
  profile: "production" as const,
  trustedBearerToken: "Bearer super-secret-token",
  workspace: {
    tenantId: "tenant_prod",
    workspaceId: "workspace_prod",
  },
};

const productionPersistence = {
  kind: "postgres" as const,
  databaseUrl: "postgres://sidechat:sidechat@localhost/sidechat",
};

const createMemoryPort = (): MemoryPort => ({
  recall: () => Effect.succeed([]),
  proposeWriteCandidates: () => Effect.succeed([]),
  writeCandidates: () => Effect.succeed(undefined),
});

const createRagRetriever = (): RagRetrieverPort => ({
  retrieve: () => Effect.succeed([]),
});

const createResearchAgent = (): ResearchAgentPort => ({
  runResearch: () => Effect.succeed({ summary: "", sources: [] }),
});
