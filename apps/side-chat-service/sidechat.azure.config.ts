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
    connection: {
      apiKey: readEnv.secret(AZURE_PROVIDER.SECRET_ENV_KEYS.API_KEY),
      endpoint: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.ENDPOINT, {
        required: true,
      }),
      apiVersion: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.API_VERSION, {
        required: true,
      }),
    },
    defaultModelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
    availableModels: [
      {
        id: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
        contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
        deployment: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.DEPLOYMENT, {
          required: true,
        }),
      },
    ],
  },
  conversationTitle: {
    modelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
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
