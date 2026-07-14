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
      apiKey: readEnv.secret(OPENAI_PROVIDER.SECRET_ENV_KEYS.API_KEY),
      baseUrl: readEnv(OPENAI_PROVIDER.TRANSPORT_ENV_KEYS.BASE_URL),
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
    maxSerializedBytes: 16_384,
    maxStringLength: 4_096,
    maxMetadataDepth: 8,
    maxMetadataEntries: 128,
  },
  auth: {
    profile: AUTH_PROFILES.PRODUCTION,
    bearerToken: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_AUTH_TOKEN),
    workspaceId: readEnv(SERVICE_ENV_KEYS.SIDECHAT_WORKSPACE_ID, {
      required: true,
    }),
  },
  timeouts: {
    queueMs: 5_000,
    providerMs: 45_000,
    clientToolMs: 30_000,
  },
  agent: {
    instructions:
      "You are a concise enterprise assistant. Use only the context and tools provided.",
    maxSteps: 8,
  },
  persistence: {
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL, {
      required: true,
    }),
  },
  keepalive: { intervalMs: 15_000 },
  telemetry: { mode: TELEMETRY_MODES.CONSOLE },
  workflow: {
    journalPruneAfterDays: 30,
    journalSweepIntervalMs: 3_600_000,
    journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, {
      required: true,
    }),
  },
});

export default config;
