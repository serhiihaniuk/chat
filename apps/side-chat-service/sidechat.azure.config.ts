import {
  defineSideChatConfig,
  readEnv,
  SERVICE_ENV_KEYS,
  type SideChatConfig,
} from "./src/config/declaration/side-chat-config.js";

const config: SideChatConfig = defineSideChatConfig({
  models: {
    provider: "azure",
    modelId: "gpt-4o",
    deployment: readEnv(SERVICE_ENV_KEYS.AZURE_OPENAI_DEPLOYMENT, {
      required: true,
    }),
    apiKey: readEnv.secret(SERVICE_ENV_KEYS.AZURE_OPENAI_API_KEY),
    endpoint: readEnv(SERVICE_ENV_KEYS.AZURE_OPENAI_ENDPOINT, {
      required: true,
    }),
    apiVersion: readEnv(SERVICE_ENV_KEYS.AZURE_OPENAI_API_VERSION, {
      required: true,
    }),
  },
  auth: {
    profile: "production",
    bearerToken: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_AUTH_TOKEN),
    workspaceId: readEnv(SERVICE_ENV_KEYS.SIDECHAT_WORKSPACE_ID, {
      required: true,
    }),
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
  telemetry: { mode: "console" },
  workflow: {
    workerConcurrency: 10,
    concurrencyHeadroom: 2,
    journalArchiveAfterDays: 7,
    journalPruneAfterDays: 30,
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, {
      required: false,
    }),
  },
});

export default config;
