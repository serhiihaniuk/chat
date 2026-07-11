import {
  AUTH_PROFILES,
  defineSideChatConfig,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "../declaration/side-chat-config.js";
import { SCRIPTED_PROVIDER } from "../providers/scripted-provider-config.js";

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
    models: {
      provider: SCRIPTED_PROVIDER.KIND,
      modelId: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
      titleModelId: SCRIPTED_PROVIDER.MODELS.TITLE.MODEL_ID,
    },
    auth: {
      profile: AUTH_PROFILES.DEVELOPMENT,
      bearerToken: "local-test-token",
      workspaceId: "local-workspace",
    },
    timeouts: { requestMs: 60_000, queueMs: 5_000, providerMs: 45_000, titleMs: 10_000 },
    agent: {
      instructions: "You are a concise Side Chat assistant.",
      maxSteps: 8,
      totalTokenBudget: 16_000,
      chunkTokenBudget: 4_000,
      toolTokenBudget: 4_000,
    },
    capacity: { activeGenerations: 8 },
    persistence: { databaseUrl: undefined },
    keepalive: { intervalMs: 15_000, proxyIdleBudgetMs: 60_000 },
    telemetry: { mode: TELEMETRY_MODES.OFF },
    workflow: {
      workerConcurrency: 10,
      concurrencyHeadroom: 2,
      journalPruneAfterDays: 30,
      journalSweepIntervalMs: 3_600_000,
      journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
      postgresUrl: undefined,
    },
  };
  return defineSideChatConfig({
    models: overrides.models ?? defaults.models,
    auth: { ...defaults.auth, ...overrides.auth },
    timeouts: { ...defaults.timeouts, ...overrides.timeouts },
    agent: { ...defaults.agent, ...overrides.agent },
    capacity: { ...defaults.capacity, ...overrides.capacity },
    persistence: { ...defaults.persistence, ...overrides.persistence },
    keepalive: { ...defaults.keepalive, ...overrides.keepalive },
    telemetry: overrides.telemetry ?? defaults.telemetry,
    workflow: { ...defaults.workflow, ...overrides.workflow },
  });
}
