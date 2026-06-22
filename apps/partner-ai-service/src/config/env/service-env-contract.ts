import { PROVIDERS } from "../catalog/index.js";
import { CAPABILITY_ENV_KEYS } from "../service-capability-config.js";

/**
 * The process-env contract for the legacy env parser.
 *
 * This is a dependency-free leaf: the env key names, deployment defaults, and the
 * blank-safe reader live here so both the parser (`service-config.ts`) and the
 * readable-config env resolver can share them without importing each other (which
 * would form an import cycle). It declares *what* env exists, not how it is parsed.
 */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

export const SERVICE_ENV_KEYS = {
  allowedModels: "SIDECHAT_ALLOWED_MODELS",
  authBearerToken: "SIDECHAT_AUTH_BEARER_TOKEN",
  ...CAPABILITY_ENV_KEYS,
  databaseUrl: "SIDECHAT_DATABASE_URL",
  demoSeedConversations: "SIDECHAT_DEMO_SEED_CONVERSATIONS",
  modelContextWindows: "SIDECHAT_MODEL_CONTEXT_WINDOWS",
  openaiApiKey: PROVIDERS.OPENAI.SECRET_ENV_KEYS.API_KEY,
  openaiBaseUrl: PROVIDERS.OPENAI.TRANSPORT_ENV_KEYS.BASE_URL,
  openaiReasoningEffort: "SIDECHAT_OPENAI_REASONING_EFFORT",
  openaiReasoningEfforts: "SIDECHAT_OPENAI_REASONING_EFFORTS",
  openaiReasoningSummary: "SIDECHAT_OPENAI_REASONING_SUMMARY",
  policyMode: "SIDECHAT_POLICY_MODE",
  port: "PORT",
  profile: "SIDECHAT_PROFILE",
  safetyPollIntervalMs: "SIDECHAT_SAFETY_POLL_INTERVAL_MS",
  instanceId: "SIDECHAT_INSTANCE_ID",
  leaseTtlMs: "SIDECHAT_LEASE_TTL_MS",
  heartbeatIntervalMs: "SIDECHAT_HEARTBEAT_INTERVAL_MS",
  reaperIntervalMs: "SIDECHAT_REAPER_INTERVAL_MS",
  reaperBatchLimit: "SIDECHAT_REAPER_BATCH_LIMIT",
  turnEventRetentionMs: "SIDECHAT_TURN_EVENT_RETENTION_MS",
  prunerIntervalMs: "SIDECHAT_PRUNER_INTERVAL_MS",
  provider: "SIDECHAT_PROVIDER",
  enableDevTools: "SIDECHAT_ENABLE_DEV_TOOLS",
  tenantId: "SIDECHAT_TENANT_ID",
  workspaceId: "SIDECHAT_WORKSPACE_ID",
} as const;

export const DEFAULT_SERVICE_PORT = 8787;
export const DEFAULT_TENANT_ID = "tenant_local";
export const DEFAULT_WORKSPACE_ID = "workspace_local";

/** Read a trimmed env value, treating blank as absent. */
export const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};
