import {
  AUTH_PROFILES,
  defineSideChatConfig,
  readEnv,
  SERVICE_ENV_KEYS,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "./src/config/declaration/side-chat-config.js";
import { AZURE_PROVIDER } from "./src/config/providers/azure-provider-config.js";

const config: SideChatConfig = defineSideChatConfig({
  models: {
    provider: AZURE_PROVIDER.KIND,
    modelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
    titleModelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
    deployment: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.DEPLOYMENT, {
      required: true,
    }),
    apiKey: readEnv.secret(AZURE_PROVIDER.SECRET_ENV_KEYS.API_KEY),
    endpoint: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.ENDPOINT, {
      required: true,
    }),
    apiVersion: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.API_VERSION, {
      required: true,
    }),
  },
  auth: {
    profile: AUTH_PROFILES.PRODUCTION,
    bearerToken: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_AUTH_TOKEN),
    workspaceId: readEnv(SERVICE_ENV_KEYS.SIDECHAT_WORKSPACE_ID, {
      required: true,
    }),
  },
  timeouts: { requestMs: 60_000, queueMs: 5_000, providerMs: 45_000, titleMs: 10_000 },
  agent: {
    instructions:
      "You are a concise enterprise assistant. Use only the context and tools provided.",
    maxSteps: 8,
    totalTokenBudget: 16_000,
    chunkTokenBudget: 4_000,
    toolTokenBudget: 4_000,
  },
  capacity: { activeGenerations: 8 },
  persistence: {
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL, {
      required: true,
    }),
  },
  keepalive: { intervalMs: 15_000, proxyIdleBudgetMs: 60_000 },
  telemetry: { mode: TELEMETRY_MODES.CONSOLE },
  workflow: {
    workerConcurrency: 10,
    concurrencyHeadroom: 2,
    journalPruneAfterDays: 30,
    journalSweepIntervalMs: 3_600_000,
    journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, {
      required: true,
    }),
  },
});

export default config;
