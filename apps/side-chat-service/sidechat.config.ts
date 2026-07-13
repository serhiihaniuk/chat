import {
  AUTH_PROFILES,
  defineSideChatConfig,
  readEnv,
  SERVICE_ENV_KEYS,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "./src/config/declaration/side-chat-config.js";
import { OPENAI_PROVIDER } from "./src/config/providers/openai-provider-config.js";

/** Production defaults remain readable here; secrets resolve only during boot. */
const config: SideChatConfig = defineSideChatConfig({
  models: {
    provider: OPENAI_PROVIDER.KIND,
    modelId: OPENAI_PROVIDER.MODELS.GPT_5_4.MODEL_ID,
    titleModelId: OPENAI_PROVIDER.MODELS.GPT_5_4.MODEL_ID,
    contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_4.CONTEXT_WINDOW_TOKENS,
    apiKey: readEnv.secret(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY),
    baseUrl: readEnv(OPENAI_PROVIDER.TRANSPORT_ENV_KEYS.BASE_URL),
    reasoningEffort: OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
  },
  auth: {
    profile: AUTH_PROFILES.PRODUCTION,
    bearerToken: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_AUTH_TOKEN),
    workspaceId: readEnv(SERVICE_ENV_KEYS.SIDECHAT_WORKSPACE_ID, {
      required: true,
    }),
  },
  timeouts: {
    requestMs: 60_000,
    queueMs: 5_000,
    providerMs: 45_000,
    clientToolMs: 30_000,
    titleMs: 10_000,
  },
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
