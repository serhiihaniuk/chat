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
};

/**
 * Stream-delivery tunables, as readable-config env references.
 *
 * `outputDeltaFlushInterval` is the window (ms) for coalescing provider text
 * into one emitted delta event (~4 events/s at the default): fewer SSE frames,
 * registry appends, and widget re-renders. It is a render-cadence knob, not a
 * resumability one — resolved into the runtime executor config.
 */
export type SideChatStreamingConfig = {
  readonly outputDeltaFlushInterval: SideChatNumberEnvReference;
};
