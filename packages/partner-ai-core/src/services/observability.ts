import {
  omitUndefinedProperties,
  redactAttributes,
  safeJsonPrimitive,
  type JsonObject,
  type JsonValue,
} from "@side-chat/shared";
import {
  RUNTIME_EVENT_TYPES,
  type RuntimeActivityDetails,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
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

/**
 * Telemetry adapter supplied by service composition.
 *
 * Invariant: a sink failure can never affect a turn. `recordStreamObservationEffect` runs
 * every observation fail-open, so a `record` that rejects is swallowed rather
 * than rejecting the request at pre-start or aborting a healthy generation
 * mid-stream. Implementations should still avoid throwing, but the workflow does
 * not depend on it.
 */
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

export type StreamObservationInput = {
  readonly correlation: RequestCorrelation;
  readonly lifecycleState: ObservabilityRecord["lifecycleState"];
  readonly assistantTurnId?: string | undefined;
  readonly providerId?: string | undefined;
  readonly modelId?: string | undefined;
  readonly errorCode?: string | undefined;
  readonly startedAt: string;
  readonly now: string;
  readonly attributes: JsonObject;
};

export const recordStreamObservation = (
  sink: ObservabilitySinkPort | undefined,
  input: StreamObservationInput,
): Effect.Effect<void, unknown> => {
  if (!sink) return Effect.succeed(undefined);

  return sink.record({
    requestId: input.correlation.requestId,
    traceId: input.correlation.traceId,
    lifecycleState: input.lifecycleState,
    assistantTurnId: input.assistantTurnId,
    providerId: input.providerId,
    modelId: input.modelId,
    errorCode: input.errorCode,
    latencyMs: elapsedMs(input.startedAt, input.now),
    attributes: redactAttributes(input.attributes),
  });
};

// This map may include raw debug fields such as output text or tool metadata.
// `recordStreamObservation` redacts the attributes before anything reaches the sink.
export const runtimeEventAttributes = (event: RuntimeEvent): JsonObject => {
  switch (event.type) {
    case RUNTIME_EVENT_TYPES.STARTED:
      return {
        eventType: event.type,
        providerId: event.providerId,
        modelId: event.modelId,
      };
    case RUNTIME_EVENT_TYPES.OUTPUT_DELTA:
      return { eventType: event.type, output: event.content };
    case RUNTIME_EVENT_TYPES.ACTIVITY:
      return {
        eventType: event.type,
        activityId: event.activityId,
        activityKind: event.activityKind,
        status: event.status,
        activityMeta: toJsonActivityMetadata(event.details),
      };
    case RUNTIME_EVENT_TYPES.COMPLETED:
      return { eventType: event.type, finishReason: event.finishReason };
    case RUNTIME_EVENT_TYPES.ERROR:
      return {
        eventType: event.type,
        errorCode: event.code,
        message: safeJsonPrimitive(event.message),
        retryable: event.retryable,
      };
    case RUNTIME_EVENT_TYPES.BLOCKED:
      return { eventType: event.type, reason: event.reason };
  }
};

const elapsedMs = (startedAt: string, now: string): number => {
  const started = Date.parse(startedAt);
  const ended = Date.parse(now);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  return Math.max(0, ended - started);
};

const toJsonActivityMetadata = (details: RuntimeActivityDetails | undefined): JsonObject | null => {
  if (!details) return null;

  const output: Record<string, JsonValue> = {};
  if (details.sources) {
    output["sourceCount"] = details.sources.length;
  }
  if (details.images) {
    output["imageCount"] = details.images.length;
  }
  if (details.tool) {
    output["tool"] = omitUndefinedProperties({
      toolCallId: details.tool.toolCallId,
      toolName: details.tool.toolName,
      parametersPresent: Boolean(details.tool.input),
      responsePresent: Boolean(details.tool.result),
      sourceCount: details.tool.sources?.length ?? 0,
      errorCode: details.tool.errorCode === "" ? undefined : details.tool.errorCode,
    });
  }
  if (details.hostCommand) {
    output["hostCommand"] = omitUndefinedProperties({
      commandId: details.hostCommand.commandId,
      commandName: details.hostCommand.commandName,
      payloadPresent: Boolean(details.hostCommand.payload),
    });
  }
  return output;
};
