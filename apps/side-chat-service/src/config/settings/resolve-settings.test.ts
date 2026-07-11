import { describe, expect, it } from "vitest";

import { formatSettingsIssues, validateSettings } from "./resolve-settings.js";
import type { SideChatConfig } from "../declaration/side-chat-config.js";

import { createDefaultConfig } from "./settings.test-fixture.js";

describe("service settings", () => {
  it("accumulates cross-field failures", () => {
    const config = createDefaultConfig({
      timeouts: { requestMs: 1_000, queueMs: 1_000, providerMs: 500 },
      agent: {
        maxSteps: 8,
        totalTokenBudget: 100,
        chunkTokenBudget: 100,
        toolTokenBudget: 101,
      },
    });

    const result = resolveTestSettings(config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "timeouts.queueMs",
        "agent.chunkTokenBudget",
        "agent.toolTokenBudget",
      ]),
    );
  });

  it("never includes a resolved secret value in diagnostics", () => {
    const secret = "SECRET_SENTINEL_DO_NOT_PRINT";
    const config = createDefaultConfig({
      workflow: {
        workerConcurrency: 1,
        concurrencyHeadroom: 2,
        journalPruneAfterDays: 30,
        postgresUrl: secret,
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
    expect(Object.isFrozen(result.settings.workflow)).toBe(true);
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
        persistence: { databaseUrl: "postgres://product:secret@db.internal/sidechat" },
        workflow: { postgresUrl: "postgres://workflow:other@db.internal/sidechat" },
      }),
    );

    expect(result.ok).toBe(true);
  });
});

function resolveTestSettings(config: SideChatConfig) {
  return validateSettings(config);
}
