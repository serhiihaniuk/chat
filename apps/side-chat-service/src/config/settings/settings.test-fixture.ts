import { defineSideChatConfig, type SideChatConfig } from "../declaration/side-chat-config.js";

type ConfigOverrides = Omit<
  Partial<{
    [Key in keyof SideChatConfig]: Partial<SideChatConfig[Key]>;
  }>,
  "models" | "telemetry"
> & {
  readonly models?: SideChatConfig["models"];
  readonly telemetry?: SideChatConfig["telemetry"];
};

export function createDefaultConfig(overrides: ConfigOverrides = {}): SideChatConfig {
  const defaults: SideChatConfig = {
    models: { provider: "scripted", modelId: "complete" },
    auth: {
      profile: "development",
      bearerToken: "local-test-token",
      workspaceId: "local-workspace",
    },
    timeouts: { requestMs: 60_000, queueMs: 5_000, providerMs: 45_000 },
    agent: {
      maxSteps: 8,
      totalTokenBudget: 16_000,
      chunkTokenBudget: 4_000,
      toolTokenBudget: 4_000,
    },
    capacity: { activeGenerations: 8 },
    keepalive: { intervalMs: 15_000, proxyIdleBudgetMs: 60_000 },
    telemetry: { mode: "off" },
    workflow: {
      workerConcurrency: 10,
      concurrencyHeadroom: 2,
      journalArchiveAfterDays: 7,
      journalPruneAfterDays: 30,
      postgresUrl: undefined,
    },
  };
  return defineSideChatConfig({
    models: overrides.models ?? defaults.models,
    auth: { ...defaults.auth, ...overrides.auth },
    timeouts: { ...defaults.timeouts, ...overrides.timeouts },
    agent: { ...defaults.agent, ...overrides.agent },
    capacity: { ...defaults.capacity, ...overrides.capacity },
    keepalive: { ...defaults.keepalive, ...overrides.keepalive },
    telemetry: overrides.telemetry ?? defaults.telemetry,
    workflow: { ...defaults.workflow, ...overrides.workflow },
  });
}
