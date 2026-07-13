import {
  AUTH_PROFILES,
  defineSideChatConfig,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "./src/config/declaration/side-chat-config.js";
import { SCRIPTED_PROVIDER } from "./src/config/providers/scripted-provider-config.js";

const config: SideChatConfig = defineSideChatConfig({
  models: {
    provider: SCRIPTED_PROVIDER.KIND,
    modelId: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
    titleModelId: SCRIPTED_PROVIDER.MODELS.TITLE.MODEL_ID,
    contextWindowTokens: SCRIPTED_PROVIDER.MODELS.COMPLETE.CONTEXT_WINDOW_TOKENS,
  },
  auth: {
    profile: AUTH_PROFILES.DEVELOPMENT,
    bearerToken: "local-test-token",
    workspaceId: "local-workspace",
  },
  timeouts: {
    requestMs: 10_000,
    queueMs: 1_000,
    providerMs: 2_000,
    clientToolMs: 1_000,
    titleMs: 1_000,
  },
  agent: {
    instructions: "You are the deterministic Side Chat test assistant.",
    maxSteps: 4,
    totalTokenBudget: 4_000,
    chunkTokenBudget: 1_000,
    toolTokenBudget: 1_000,
  },
  capacity: { activeGenerations: 2 },
  persistence: { databaseUrl: undefined },
  keepalive: { intervalMs: 5_000, proxyIdleBudgetMs: 30_000 },
  telemetry: { mode: TELEMETRY_MODES.OFF },
  workflow: {
    workerConcurrency: 3,
    concurrencyHeadroom: 1,
    journalPruneAfterDays: 2,
    journalSweepIntervalMs: 60_000,
    journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
    postgresUrl: undefined,
  },
});

export default config;
