import { optionalField, type JsonObject, type JsonValue } from "@side-chat/shared";
import { Effect } from "effect";
import {
  redactAttributes,
  safeJsonPrimitive,
  type ObservabilityRecord,
  type ObservabilitySinkPort,
  type RequestCorrelation,
} from "./observability.js";
import { RUNTIME_EVENT_TYPES, type RuntimeActivityDetails, type RuntimeEvent } from "#ports";

export type StreamObservationInput = {
  readonly correlation: RequestCorrelation;
  readonly lifecycleState: ObservabilityRecord["lifecycleState"];
  readonly assistantTurnId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly errorCode?: string;
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
    ...optionalField("assistantTurnId", input.assistantTurnId || undefined),
    ...optionalField("providerId", input.providerId || undefined),
    ...optionalField("modelId", input.modelId || undefined),
    ...optionalField("errorCode", input.errorCode || undefined),
    latencyMs: elapsedMs(input.startedAt, input.now),
    attributes: redactAttributes(input.attributes),
  });
};

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
    output["tool"] = {
      toolCallId: details.tool.toolCallId,
      toolName: details.tool.toolName,
      parametersPresent: Boolean(details.tool.input),
      responsePresent: Boolean(details.tool.result),
      sourceCount: details.tool.sources?.length ?? 0,
      ...optionalField("errorCode", details.tool.errorCode || undefined),
    };
  }
  return output;
};
