/**
 * The process-env contract for the readable config system.
 *
 * This is a dependency-free leaf: the env key names, deployment defaults, and
 * the blank-safe reader live here so the config files (which declare env inputs
 * via `readEnv` references) and the boot-path resolvers share one vocabulary.
 * It declares *what* env exists, not how it is parsed. Provider secrets keep
 * their canonical names in the provider catalog (`PROVIDERS.*.SECRET_ENV_KEYS`)
 * and are referenced from the config files directly.
 */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

export const SERVICE_ENV_KEYS = {
  authBearerToken: "SIDECHAT_AUTH_BEARER_TOKEN",
  databaseUrl: "SIDECHAT_DATABASE_URL",
  demoSeedConversations: "SIDECHAT_DEMO_SEED_CONVERSATIONS",
  port: "PORT",
  profile: "SIDECHAT_PROFILE",
  safetyPollIntervalMs: "SIDECHAT_SAFETY_POLL_INTERVAL_MS",
  instanceId: "SIDECHAT_INSTANCE_ID",
  leaseTtlMs: "SIDECHAT_LEASE_TTL_MS",
  heartbeatIntervalMs: "SIDECHAT_HEARTBEAT_INTERVAL_MS",
  reaperIntervalMs: "SIDECHAT_REAPER_INTERVAL_MS",
  reaperBatchLimit: "SIDECHAT_REAPER_BATCH_LIMIT",
  sseHeartbeatIntervalMs: "SIDECHAT_SSE_HEARTBEAT_MS",
  outputDeltaFlushIntervalMs: "SIDECHAT_OUTPUT_DELTA_FLUSH_MS",
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
