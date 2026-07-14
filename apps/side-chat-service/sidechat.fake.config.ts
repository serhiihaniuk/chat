import {
  AUTH_PROFILES,
  defineSideChatConfig,
  readEnv,
  SERVICE_ENV_KEYS,
  TELEMETRY_MODES,
  WORKFLOW_JOURNAL_CLASSES,
  type SideChatConfig,
} from "./src/config/declaration/side-chat-config.js";
import { SCRIPTED_PROVIDER } from "./src/config/providers/scripted-provider-config.js";

const config: SideChatConfig = defineSideChatConfig({
  models: {
    provider: SCRIPTED_PROVIDER.KIND,
    defaultModelId: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
    availableModels: [
      {
        id: SCRIPTED_PROVIDER.MODELS.COMPLETE.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.COMPLETE.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.BLOCK.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.BLOCK.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.HAPPY.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.HAPPY.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.MULTI_STEP.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.MULTI_STEP.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.EMPTY.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.EMPTY.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.STEP_LIMIT.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.STEP_LIMIT.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.REASONING_ONLY.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.REASONING_ONLY.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.CLIENT_TOOL.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.CLIENT_TOOL.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.NATIVE_APPROVAL_GAP.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.NATIVE_APPROVAL_GAP.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.CANCEL_BEFORE_FIRST.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.CANCEL_BEFORE_FIRST.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.CANCEL_MID.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.CANCEL_MID.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.ERROR_BEFORE.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.ERROR_BEFORE.CONTEXT_WINDOW_TOKENS,
      },
      {
        id: SCRIPTED_PROVIDER.MODELS.ERROR_MID.MODEL_ID,
        contextWindowTokens: SCRIPTED_PROVIDER.MODELS.ERROR_MID.CONTEXT_WINDOW_TOKENS,
      },
    ],
  },
  conversationTitle: {
    modelId: SCRIPTED_PROVIDER.MODELS.TITLE.MODEL_ID,
    timeoutMs: 1_000,
  },
  serverTools: [],
  hostContext: {
    maxSerializedBytes: 16_384,
    maxStringLength: 4_096,
    maxMetadataDepth: 8,
    maxMetadataEntries: 128,
  },
  auth: {
    profile: AUTH_PROFILES.DEVELOPMENT,
    bearerToken: "local-test-token",
    workspaceId: "local-workspace",
  },
  timeouts: {
    queueMs: 1_000,
    providerMs: 2_000,
    clientToolMs: 1_000,
  },
  agent: {
    instructions: "You are the deterministic Side Chat test assistant.",
    maxSteps: 4,
  },
  persistence: {
    databaseUrl: readEnv.secret(SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL, {
      required: false,
    }),
  },
  keepalive: { intervalMs: 5_000 },
  telemetry: { mode: TELEMETRY_MODES.OFF },
  workflow: {
    journalPruneAfterDays: 2,
    journalSweepIntervalMs: 60_000,
    journalClass: WORKFLOW_JOURNAL_CLASSES.OPERATIONAL,
    postgresUrl: readEnv.secret(SERVICE_ENV_KEYS.WORKFLOW_POSTGRES_URL, {
      required: false,
    }),
  },
});

export default config;
