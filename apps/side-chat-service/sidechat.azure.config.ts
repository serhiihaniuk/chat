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
      apiKey: readEnv.secret(AZURE_PROVIDER.SECRET_ENV_KEYS.API_KEY, {
        description: "Azure OpenAI API key used to create provider clients.",
      }),
      endpoint: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.ENDPOINT, {
        description: "Azure OpenAI resource endpoint.",
        required: true,
      }),
      apiVersion: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.API_VERSION, {
        description: "Azure OpenAI API version used by every configured deployment.",
        required: true,
      }),
    },
    defaultModelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
    availableModels: [
      {
        id: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
        contextWindowTokens: AZURE_PROVIDER.MODELS.GPT_4O.CONTEXT_WINDOW_TOKENS,
        deployment: readEnv(AZURE_PROVIDER.TRANSPORT_ENV_KEYS.DEPLOYMENT, {
          description: "Azure deployment name serving the request-selectable model.",
          required: true,
        }),
      },
    ],
  },
  conversationTitle: {
    modelId: AZURE_PROVIDER.MODELS.GPT_4O.MODEL_ID,
    timeoutMs: 10_000,
  },
  // The built-in search simulation requires OpenAI gpt-5.4-mini.
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
    bearerToken: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_AUTH_TOKEN, {
      description: "Bearer token accepted by the built-in production auth profile.",
    }),
    workspaceId: readEnv(SERVICE_ENV_KEYS.SIDECHAT_WORKSPACE_ID, {
      description: "Workspace id assigned to requests accepted by the built-in auth profile.",
      required: true,
    }),
  },
  timeouts: {
    queueMs: 5_000,
    providerMs: 180_000,
    clientToolMs: 30_000,
  },
  capacity: {
    maxActiveTurns: 16,
    queueSize: 32,
    queueTimeoutMs: 5_000,
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
