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
    connection: {
      apiKey: readEnv.secret(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY, {
        description: "OpenAI API key used to create provider clients.",
      }),
      baseUrl: readEnv(OPENAI_PROVIDER.TRANSPORT_ENV_KEYS.BASE_URL, {
        description: "Optional OpenAI-compatible API base URL override.",
      }),
    },
    reasoningSummary: OPENAI_PROVIDER.REASONING_SUMMARIES.CONCISE,
    defaultModelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
    availableModels: [
      {
        id: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
        contextWindowTokens: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.CONTEXT_WINDOW_TOKENS,
        reasoning: {
          defaultEffort: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.DEFAULT_REASONING_EFFORT,
          efforts: [
            OPENAI_PROVIDER.REASONING_EFFORTS.LOW,
            OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
            OPENAI_PROVIDER.REASONING_EFFORTS.HIGH,
          ],
        },
      },
    ],
  },
  conversationTitle: {
    modelId: OPENAI_PROVIDER.MODELS.GPT_5_6_LUNA.MODEL_ID,
    timeoutMs: 10_000,
  },
  serverTools: [],
  hostContext: {
    enabled: true,
    maxSerializedBytes: 16_384,
    maxStringLength: 4_096,
    maxMetadataDepth: 8,
    maxMetadataEntries: 128,
  },
  auth: { profile: AUTH_PROFILES.PRODUCTION },
  timeouts: {
    queueMs: 5_000,
    providerMs: 180_000,
    clientToolMs: 30_000,
  },
  capacity: {
    maxActiveTurns: 16,
    maxActivityStreams: 1_024,
    maxActivityStreamsPerSubject: 8,
    queueSize: 32,
    queueTimeoutMs: 5_000,
    drainBudgetMs: readEnv.number(SERVICE_ENV_KEYS.SIDECHAT_DRAIN_BUDGET_MS, {
      description: "Maximum time to wait for admitted turns during process shutdown.",
      defaultValue: 20_000,
    }),
  },
  agent: {
    instructions:
      "You are a concise enterprise assistant. Use only the context and tools provided.",
    maxSteps: 8,
  },
  persistence: {
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL, {
      description: "PostgreSQL connection used for Side Chat product records.",
      required: true,
    }),
  },
  keepalive: { intervalMs: 15_000 },
  telemetry: { mode: TELEMETRY_MODES.CONSOLE },
  workflow: {
    workerConcurrency: readEnv.number(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_WORKER_CONCURRENCY, {
      description: "Maximum concurrent jobs executed by the Postgres Workflow worker.",
      defaultValue: 50,
    }),
    maxPoolSize: readEnv.number(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_MAX_POOL_SIZE, {
      description: "Maximum Postgres connections available to the Workflow world.",
      required: true,
    }),
    journalPruneAfterDays: 30,
    journalSweepIntervalMs: 3_600_000,
    journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, {
      description: "PostgreSQL connection used by the compiled Workflow world.",
      required: true,
    }),
  },
});

export default config;
