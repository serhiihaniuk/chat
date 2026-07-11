import {
  defineSideChatConfig,
  readEnv,
  SERVICE_ENV_KEYS,
  type SideChatConfig,
} from "./src/ports/configuration/side-chat-config.js";

/** Production defaults remain readable here; secrets resolve only during boot. */
const config: SideChatConfig = defineSideChatConfig({
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
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, { required: false }),
  },
});

export default config;
