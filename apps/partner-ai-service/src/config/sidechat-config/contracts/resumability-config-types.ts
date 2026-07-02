import type { SideChatNumberEnvReference, SideChatStringEnvReference } from "../env-references.js";

/**
 * Operator tunables for connection-bound streaming, as readable-config env references.
 *
 * Deployment knobs, not assistant behavior: a missed-signal reconcile poll and
 * the owner-lease/heartbeat/reaper crash-recovery knobs (ADR 0008). Each field's
 * runtime meaning is documented on `ResumabilityConfig` in
 * service-composition-types.ts; the `NOTIFY` channels and the reaper's NULL-lease
 * grace stay db/catalog constants rather than env references.
 */
export type SideChatResumabilityConfig = {
  readonly safetyPollInterval: SideChatNumberEnvReference;
  readonly instanceId: SideChatStringEnvReference;
  readonly leaseTtl: SideChatNumberEnvReference;
  readonly heartbeatInterval: SideChatNumberEnvReference;
  readonly reaperInterval: SideChatNumberEnvReference;
  readonly reaperBatchLimit: SideChatNumberEnvReference;
  // Window (ms) for coalescing streamed text into one emitted delta event;
  // governs the per-turn event rate. Resolved into the runtime executor config.
  readonly outputDeltaFlushInterval: SideChatNumberEnvReference;
};
