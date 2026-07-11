import { defineSideChatConfig, type SideChatConfig } from "#ports/configuration/side-chat-config";

type ConfigOverrides = Partial<{ [Key in keyof SideChatConfig]: Partial<SideChatConfig[Key]> }>;

export function createDefaultConfig(overrides: ConfigOverrides = {}): SideChatConfig {
  const defaults: SideChatConfig = {
    timeouts: { requestMs: 60_000, queueMs: 5_000, providerMs: 45_000 },
    agent: {
      maxSteps: 8,
      totalTokenBudget: 16_000,
      chunkTokenBudget: 4_000,
      toolTokenBudget: 4_000,
    },
    capacity: { activeGenerations: 8 },
    keepalive: { intervalMs: 15_000, proxyIdleBudgetMs: 60_000 },
    telemetry: { enabled: true },
    workflow: {
      workerConcurrency: 10,
      concurrencyHeadroom: 2,
      journalArchiveAfterDays: 7,
      journalPruneAfterDays: 30,
      postgresUrl: undefined,
    },
  };
  return defineSideChatConfig({
    timeouts: { ...defaults.timeouts, ...overrides.timeouts },
    agent: { ...defaults.agent, ...overrides.agent },
    capacity: { ...defaults.capacity, ...overrides.capacity },
    keepalive: { ...defaults.keepalive, ...overrides.keepalive },
    telemetry: { ...defaults.telemetry, ...overrides.telemetry },
    workflow: { ...defaults.workflow, ...overrides.workflow },
  });
}
