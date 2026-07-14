import { describe, expect, it } from "vitest";

import { formatSettingsIssues, validateSettings } from "./resolve-settings.js";
import type { SideChatConfig } from "../declaration/side-chat-config.js";

import { createDefaultConfig } from "./settings.test-fixture.js";

describe("service settings", () => {
  it("accumulates model, tool, and timeout policy failures", () => {
    const config = createDefaultConfig({
      models: {
        provider: "openai",
        connection: { apiKey: "test-key" },
        defaultModelId: "missing-model",
        availableModels: [
          {
            id: "duplicate-model",
            contextWindowTokens: 1_000,
            reasoning: { defaultEffort: "high", efforts: ["low"] },
          },
          { id: "duplicate-model", contextWindowTokens: 2_000 },
        ],
      },
      serverTools: ["known_tool", "known_tool", "missing_tool"],
      timeouts: {
        providerMs: 500,
        clientToolMs: 500,
      },
    });

    const result = validateSettings(config, {
      registeredServerToolNames: ["known_tool"],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "models.availableModels",
        "models.defaultModelId",
        "models.availableModels.0.reasoning.defaultEffort",
        "serverTools",
        "timeouts.clientToolMs",
      ]),
    );
  });

  it("never includes a resolved secret value in diagnostics", () => {
    const secret = "SECRET_SENTINEL_DO_NOT_PRINT";
    const config = createDefaultConfig({
      workflow: {
        postgresUrl: "postgres://workflow@db.internal/sidechat-other",
      },
      persistence: { databaseUrl: `postgres://product:${secret}@db.internal/sidechat` },
    });

    const result = resolveTestSettings(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(formatSettingsIssues(result.issues)).not.toContain(secret);
  });

  it("returns deeply immutable settings", () => {
    const result = resolveTestSettings(createDefaultConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.settings)).toBe(true);
    expect(Object.isFrozen(result.settings.workflow)).toBe(true);
    expect(Object.isFrozen(result.settings.models.availableModels)).toBe(true);
  });

  it("requires one database for legal-hold-safe Workflow maintenance", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        persistence: { databaseUrl: "postgres://product" },
        workflow: { postgresUrl: "postgres://workflow" },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "workflow.postgresUrl",
      message: "must use the product Postgres database for legal-hold-safe journal pruning",
    });
  });

  it("allows separate least-privilege principals for the same database", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        persistence: {
          databaseUrl: "postgres://product:secret@db.internal/sidechat",
        },
        workflow: {
          postgresUrl: "postgres://workflow:other@db.internal/sidechat",
        },
      }),
    );

    expect(result.ok).toBe(true);
  });
});

function resolveTestSettings(config: SideChatConfig) {
  return validateSettings(config);
}
