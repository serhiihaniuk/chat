import { describe, expect, it } from "vitest";

import { formatSettingsIssues, validateSettings } from "./resolve-settings.js";
import type { SideChatConfig } from "../declaration/side-chat-config.js";

import { createDefaultConfig } from "./settings.test-fixture.js";

describe("service settings", () => {
  it("resolves the declared admission and Workflow capacity defaults", () => {
    const result = resolveTestSettings(createDefaultConfig());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.capacity).toEqual({
      maxActiveTurns: 16,
      maxActivityStreams: 1_024,
      maxActivityStreamsPerSubject: 8,
      queueSize: 32,
      queueTimeoutMs: 5_000,
      drainBudgetMs: 20_000,
    });
    expect(result.settings.workflow).toMatchObject({
      workerConcurrency: 50,
      maxPoolSize: 52,
    });
  });

  it("keeps the per-subject activity stream limit within the process limit", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        capacity: { maxActivityStreams: 4, maxActivityStreamsPerSubject: 5 },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "capacity.maxActivityStreamsPerSubject",
      message: "must not exceed capacity.maxActivityStreams",
    });
  });

  it("allows deployments to disable admission waiting with a zero-sized queue", () => {
    const result = resolveTestSettings(createDefaultConfig({ capacity: { queueSize: 0 } }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.settings.capacity.queueSize).toBe(0);
  });

  it("rejects the scripted provider from the production auth profile", () => {
    const result = resolveTestSettings(createDefaultConfig({ auth: { profile: "production" } }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "models.provider",
      message: "must use a production provider with the production auth profile",
    });
  });

  it("reserves explicit Workflow worker headroom above active turns", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        capacity: { maxActiveTurns: 16 },
        workflow: { workerConcurrency: 19, maxPoolSize: 21 },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "workflow.workerConcurrency",
      message: "must be at least capacity.maxActiveTurns + 4 worker headroom (20)",
    });
  });

  it("keeps the Workflow Postgres pool floor at ten", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        capacity: { maxActiveTurns: 4 },
        workflow: { workerConcurrency: 8, maxPoolSize: 9 },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "workflow.maxPoolSize",
      message: "must be at least max(10, workflow.workerConcurrency + 2) (10)",
    });
  });

  it("adds two Workflow Postgres connections above worker concurrency", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        workflow: { workerConcurrency: 50, maxPoolSize: 51 },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "workflow.maxPoolSize",
      message: "must be at least max(10, workflow.workerConcurrency + 2) (52)",
    });
  });

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
      persistence: {
        databaseUrl: `postgres://product:${secret}@db.internal/sidechat`,
      },
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
    expect(Object.isFrozen(result.settings.capacity)).toBe(true);
    expect(Object.isFrozen(result.settings.workflow)).toBe(true);
    expect(Object.isFrozen(result.settings.hostContext)).toBe(true);
    expect(Object.isFrozen(result.settings.models.availableModels)).toBe(true);
  });

  it("requires every consumed host-context limit to be a positive integer", () => {
    const result = resolveTestSettings(
      createDefaultConfig({
        hostContext: {
          maxSerializedBytes: 0,
          maxStringLength: -1,
          maxMetadataDepth: 1.5,
          maxMetadataEntries: Number.NaN,
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual(
      expect.arrayContaining([
        {
          path: "hostContext.maxSerializedBytes",
          message: "must be a positive integer",
        },
        {
          path: "hostContext.maxStringLength",
          message: "must be a positive integer",
        },
        {
          path: "hostContext.maxMetadataDepth",
          message: "must be a positive integer",
        },
        {
          path: "hostContext.maxMetadataEntries",
          message: "must be a positive integer",
        },
      ]),
    );
  });

  it("requires host-context enablement to be a boolean", () => {
    const config = createDefaultConfig();
    const result = validateSettings({
      ...config,
      hostContext: { ...config.hostContext, enabled: "true" },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual({
      path: "hostContext.enabled",
      message: "must be a boolean",
    });
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
