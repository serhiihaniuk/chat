import type { ResumabilityConfig } from "#composition/service-composition-types";
import { DEFAULT_INSTANCE_ID, RESUMABILITY_DEFAULTS } from "../catalog/config-values.js";
import { ServiceConfigError } from "../service-config-error.js";
import { SERVICE_ENV_KEYS, envValue, type ServiceEnv } from "./service-env-contract.js";

/**
 * Resolve the resumability tunables from raw env for the legacy env parser.
 *
 * Mirrors the readable-config resolver: the same env keys and catalog defaults
 * feed the runner lease, heartbeat, reaper, and subscriber poll. It imports only
 * the cycle-free env contract and the catalog, so it never forms an import cycle
 * with `service-config.ts`. Durations must be positive; `instanceId` falls back to
 * a stable per-process id so a single local instance still owns its leases.
 */
export const createResumabilityConfigFromEnv = (env: ServiceEnv): ResumabilityConfig => ({
  safetyPollIntervalMs: readPositiveDuration(
    env,
    SERVICE_ENV_KEYS.safetyPollIntervalMs,
    RESUMABILITY_DEFAULTS.SAFETY_POLL_INTERVAL_MS,
  ),
  instanceId: envValue(env, SERVICE_ENV_KEYS.instanceId) ?? DEFAULT_INSTANCE_ID,
  leaseTtlMs: readPositiveDuration(
    env,
    SERVICE_ENV_KEYS.leaseTtlMs,
    RESUMABILITY_DEFAULTS.LEASE_TTL_MS,
  ),
  heartbeatIntervalMs: readPositiveDuration(
    env,
    SERVICE_ENV_KEYS.heartbeatIntervalMs,
    RESUMABILITY_DEFAULTS.HEARTBEAT_INTERVAL_MS,
  ),
  reaperIntervalMs: readPositiveDuration(
    env,
    SERVICE_ENV_KEYS.reaperIntervalMs,
    RESUMABILITY_DEFAULTS.REAPER_INTERVAL_MS,
  ),
  reaperBatchLimit: readPositiveInteger(
    env,
    SERVICE_ENV_KEYS.reaperBatchLimit,
    RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT,
  ),
});

const readPositiveDuration = (env: ServiceEnv, key: string, fallback: number): number => {
  const rawValue = envValue(env, key);
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new ServiceConfigError(`${key} must be a positive number.`);
};

// Batch limits are counts, so they must be positive integers (a fractional limit
// is meaningless to the bounded sweep).
const readPositiveInteger = (env: ServiceEnv, key: string, fallback: number): number => {
  const rawValue = envValue(env, key);
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new ServiceConfigError(`${key} must be a positive integer.`);
};
