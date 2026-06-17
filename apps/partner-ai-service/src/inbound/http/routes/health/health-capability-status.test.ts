import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { describe, expect, it } from "vitest";
import { createPartnerAiServiceApp } from "../../app.js";

describe("partner ai service capability diagnostics", () => {
  it("reports implemented capabilities explicitly", async () => {
    const response = await createPartnerAiServiceApp().request("/healthz");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      service: "partner-ai-service",
      capabilities: {
        history: {
          capability: "history",
          state: "disabled",
          adapterId: "repository-conversation-history-context",
          policyId: "disabled",
          safeForProduction: true,
        },
        contextAdmission: {
          capability: "contextAdmission",
          state: "configured",
          adapterId: "deterministic-budgeted-context-admission",
          policyId: "deterministic_v1",
          selectionMode: "budgeted",
          recordedBudget: {
            maxInputTokens: 24_000,
            reservedOutputTokens: 4_000,
            sourceTokenBudgets: {
              history: 4_000,
            },
          },
          safeForProduction: true,
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

const productionAuth = {
  profile: "production" as const,
  trustedBearerToken: "Bearer super-secret-token",
  workspace: {
    tenantId: "tenant_prod",
    workspaceId: "workspace_prod",
  },
};
