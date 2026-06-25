import type { SideChatNumberEnvReference, SideChatStringEnvReference } from "../env-references.js";

/**
 * Operator tunables for resumable streaming, as readable-config env references.
 *
 * Deployment knobs, not assistant behavior: a missed-NOTIFY reconcile poll, the
 * owner-lease/heartbeat/reaper fencing knobs, and the turn_events retention/pruning
 * knobs. Each field's runtime meaning is documented on `ResumabilityConfig` in
 * service-composition-types.ts; the `NOTIFY` channel and the pruner batch size stay
 * db/catalog constants rather than env references.
 */
export type SideChatResumabilityConfig = {
  readonly safetyPollInterval: SideChatNumberEnvReference;
  readonly instanceId: SideChatStringEnvReference;
  readonly leaseTtl: SideChatNumberEnvReference;
  readonly heartbeatInterval: SideChatNumberEnvReference;
  readonly reaperInterval: SideChatNumberEnvReference;
  readonly reaperBatchLimit: SideChatNumberEnvReference;
  readonly turnEventRetention: SideChatNumberEnvReference;
  readonly prunerInterval: SideChatNumberEnvReference;
};
