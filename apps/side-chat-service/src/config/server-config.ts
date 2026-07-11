/**
 * Environment adapter for the service; all process.env reads live here.
 *
 * This is a dependency-free leaf declaring the service's complete env
 * vocabulary: key names, closed value sets, defaults, and the blank-safe
 * reader. Nothing else in the service may read process.env or spell an env
 * key or world module name inline.
 *
 * Nitro owns HTTP listening (HOST/PORT are read by the server runtime).
 * The workflow toolchain owns durable-world selection:
 * - `WORKFLOW_TARGET_WORLD` selects the world module at BUILD time (esbuild
 *   alias). Production builds set it to the postgres world; when unset (dev,
 *   tests) the build bundles the embedded local world.
 * - `WORKFLOW_POSTGRES_URL` is the postgres world's runtime connection
 *   string. Treat it as a secret: never log it or expose it through routes.
 * - `WORKFLOW_LOCAL_*` keys configure the embedded local world; only the
 *   test harness sets them (disposable data dir, explicit base URL).
 */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

export const SERVICE_ENV_KEYS = {
  testComposition: "SIDECHAT_TEST_COMPOSITION",
  workflowTargetWorld: "WORKFLOW_TARGET_WORLD",
  workflowPostgresUrl: "WORKFLOW_POSTGRES_URL",
  workflowLocalDataDir: "WORKFLOW_LOCAL_DATA_DIR",
  workflowLocalBaseUrl: "WORKFLOW_LOCAL_BASE_URL",
} as const;

/** Closed value set for `SIDECHAT_TEST_COMPOSITION`. */
export const TEST_COMPOSITION = {
  ENABLED: "enabled",
} as const;

/** Closed value set for `WORKFLOW_TARGET_WORLD` (world module specifiers). */
export const WORKFLOW_WORLDS = {
  LOCAL: "@workflow/world-local",
  POSTGRES: "@workflow/world-postgres",
} as const;

/** Read a trimmed env value, treating blank as absent. */
export const envValue = (env: ServiceEnv, key: string): string | undefined => {
  const value = env[key]?.trim();
  return value ? value : undefined;
};

export interface ServerConfig {
  readonly useTestComposition: boolean;
  readonly workflowTargetWorld: string;
  readonly workflowPostgresUrl: string | undefined;
}

export function readServerConfig(env: ServiceEnv): ServerConfig {
  return {
    useTestComposition:
      envValue(env, SERVICE_ENV_KEYS.testComposition) === TEST_COMPOSITION.ENABLED,
    workflowTargetWorld:
      envValue(env, SERVICE_ENV_KEYS.workflowTargetWorld) ?? WORKFLOW_WORLDS.LOCAL,
    workflowPostgresUrl: envValue(env, SERVICE_ENV_KEYS.workflowPostgresUrl),
  };
}

export const serverConfig = readServerConfig(process.env);
