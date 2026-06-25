import { DEFAULT_INSTANCE_ID, RESUMABILITY_DEFAULTS } from "#config/catalog/config-values";
import type { ResumabilityConfig, ResumabilityOptions } from "./service-composition-types.js";

/**
 * Resolve the resumability tunables, falling back to catalog defaults per field.
 *
 * Composition stays the single place these knobs land: the env/config adapters
 * resolve them, and any omitted field uses the same catalog default the config
 * declares, so the runner lease, reaper, pruner, and subscriber poll never read
 * literals.
 */
export const resolveResumabilityConfig = (
  resumability: ResumabilityOptions | undefined,
): ResumabilityConfig => {
  // One numeric resolver per field keeps the override-or-default choice in a single
  // place, so adding a knob does not add another branch to this spine function.
  const num = (value: number | undefined, fallback: number): number => value ?? fallback;
  return {
    safetyPollIntervalMs: num(
      resumability?.safetyPollIntervalMs,
      RESUMABILITY_DEFAULTS.SAFETY_POLL_INTERVAL_MS,
    ),
    instanceId: resumability?.instanceId ?? DEFAULT_INSTANCE_ID,
    leaseTtlMs: num(resumability?.leaseTtlMs, RESUMABILITY_DEFAULTS.LEASE_TTL_MS),
    heartbeatIntervalMs: num(
      resumability?.heartbeatIntervalMs,
      RESUMABILITY_DEFAULTS.HEARTBEAT_INTERVAL_MS,
    ),
    reaperIntervalMs: num(resumability?.reaperIntervalMs, RESUMABILITY_DEFAULTS.REAPER_INTERVAL_MS),
    reaperBatchLimit: num(resumability?.reaperBatchLimit, RESUMABILITY_DEFAULTS.REAPER_BATCH_LIMIT),
    turnEventRetentionMs: num(
      resumability?.turnEventRetentionMs,
      RESUMABILITY_DEFAULTS.TURN_EVENT_RETENTION_MS,
    ),
    prunerIntervalMs: num(resumability?.prunerIntervalMs, RESUMABILITY_DEFAULTS.PRUNER_INTERVAL_MS),
    prunerBatchLimit: num(resumability?.prunerBatchLimit, RESUMABILITY_DEFAULTS.PRUNER_BATCH_LIMIT),
  };
};
