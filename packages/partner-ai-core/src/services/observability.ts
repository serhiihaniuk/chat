import type { JsonObject } from "@side-chat/shared";
import { Effect } from "effect";

// Redaction is one implementation, owned by `@side-chat/shared` (zero-dep) so the
// diagnostic logger, this telemetry channel, and any adapter share the exact same
// safety net. Re-exported here so core's public telemetry surface is unchanged.
export { redactAttributes, safeJsonPrimitive } from "@side-chat/shared";

/** Secret-safe telemetry records emitted by the stream-chat workflow. */

/** Correlation fields available before a durable assistant turn exists. */
export type TraceCorrelationInput = {
  readonly requestId: string;
  readonly traceId?: string | undefined;
};

/** Stable ids used to connect logs, persisted turn records, and stream events. */
export type RequestCorrelation = {
  readonly requestId: string;
  readonly traceId: string;
};

export type ObservabilityLifecycleState =
  | "received"
  | "started"
  | "runtime_event"
  | "completed"
  | "failed"
  // Resumable-streaming lifecycle, recorded by the service transport (not the core
  // turn workflow) so operators can see subscriber churn, replay outcomes, reaps,
  // cancels, and run duration on terminal across instances.
  | "subscriber_attached"
  | "subscriber_detached"
  | "replay_served"
  | "replay_expired"
  | "event_read_failed"
  | "turn_reaped"
  | "turn_cancelled"
  | "run_finished";

/**
 * Redacted lifecycle observation for one stream-chat turn.
 *
 * Core receives each lifecycle observation as this telemetry-safe record before
 * calling the sink. The record may identify lifecycle state and selected
 * provider/model ids; model-visible text and raw adapter/provider errors must
 * already be removed or redacted.
 */
export type ObservabilityRecord = RequestCorrelation & {
  readonly lifecycleState: ObservabilityLifecycleState;
  readonly assistantTurnId?: string | undefined;
  readonly providerId?: string | undefined;
  readonly modelId?: string | undefined;
  readonly latencyMs: number;
  readonly errorCode?: string | undefined;
  readonly attributes: JsonObject;
};

/** Telemetry adapter supplied by service composition. */
export type ObservabilitySinkPort = {
  readonly record: (record: ObservabilityRecord) => Effect.Effect<void, unknown>;
};

/**
 * Explicit no-op sink for compositions that do not install telemetry yet.
 *
 * The stream-chat workflow can stay Effect-native without forcing every local
 * test or development route to invent an observability adapter. Production can
 * replace this with a real sink at the Layer boundary.
 */
export const NOOP_OBSERVABILITY_SINK: ObservabilitySinkPort = {
  record: () => Effect.succeed(undefined),
};

export const createRequestCorrelation = (input: TraceCorrelationInput): RequestCorrelation => ({
  requestId: input.requestId,
  traceId: input.traceId ?? `trace_${input.requestId}`,
});
