import type { ResumabilityConfig } from "#composition/service-composition-types";
import { DEFAULT_INSTANCE_ID, RESUMABILITY_DEFAULTS } from "../../catalog/config-values.js";
import { readNumberEnvReference, readStringEnvReference } from "../environment.js";
import type { ServiceEnv, SideChatConfig } from "../types.js";

/**
 * Resolve the resumability tunables from the readable config's env references.
 *
 * Mirrors the legacy env parser's resolver: the same catalog defaults feed the
 * runner lease, reaper, and subscriber poll. Every knob is an env reference
 * declared in `sidechat.config.ts`.
 */
export const createResumabilityConfig = (
  config: SideChatConfig,
  env: ServiceEnv,
): ResumabilityConfig => {
  const resumability = config.resumability;
  // One numeric resolver per field keeps the override-or-default choice in a single
  // place, so adding a knob does not add another branch to this function.
  const num = (reference: Parameters<typeof readNumberEnvReference>[1], fallback: number): number =>
    readNumberEnvReference(env, reference) ?? fallback;
  return {
    safetyPollIntervalMs: num(
      resumability.safetyPollInterval,
      RESUMABILITY_DEFAULTS.SAFETY_POLL_INTERVAL_MS,
    ),
    instanceId: readStringEnvReference(env, resumability.instanceId) ?? DEFAULT_INSTANCE_ID,
    leaseTtlMs: num(resumability.leaseTtl, RESUMABILITY_DEFAULTS.LEASE_TTL_MS),
    heartbeatIntervalMs: num(
      resumability.heartbeatInterval,
      RESUMABILITY_DEFAULTS.HEARTBEAT_INTERVAL_MS,
    ),
    reaperIntervalMs: num(resumability.reaperInterval, RESUMABILITY_DEFAULTS.REAPER_INTERVAL_MS),
    reaperBatchLimit: num(resumability.reaperBatchLimit, RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT),
  };
};
