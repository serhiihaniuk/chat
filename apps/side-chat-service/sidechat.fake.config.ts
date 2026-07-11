import {
  defineSideChatConfig,
  type SideChatConfig,
} from "./src/ports/configuration/side-chat-config.js";

const config: SideChatConfig = defineSideChatConfig({
  timeouts: { requestMs: 10_000, queueMs: 1_000, providerMs: 5_000 },
  agent: {
    maxSteps: 4,
    totalTokenBudget: 4_000,
    chunkTokenBudget: 1_000,
    toolTokenBudget: 1_000,
  },
  capacity: { activeGenerations: 2 },
  keepalive: { intervalMs: 5_000, proxyIdleBudgetMs: 30_000 },
  telemetry: { enabled: false },
  workflow: {
    workerConcurrency: 3,
    concurrencyHeadroom: 1,
    journalArchiveAfterDays: 1,
    journalPruneAfterDays: 2,
    postgresUrl: undefined,
  },
});

export default config;
