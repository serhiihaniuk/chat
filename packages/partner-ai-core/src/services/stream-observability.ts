import {
  SIDECHAT_EVENT_TYPES,
  type JsonObject,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  redactAttributes,
  safeJsonPrimitive,
  type ObservabilityRecord,
  type ObservabilitySinkPort,
  type RequestCorrelation,
} from "./observability.js";
import type { RuntimeEvent } from "#ports";

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

export const recordStreamObservation = async (
  sink: ObservabilitySinkPort | undefined,
  input: StreamObservationInput,
): Promise<void> => {
  if (!sink) return;

  await sink.record({
    requestId: input.correlation.requestId,
    traceId: input.correlation.traceId,
    lifecycleState: input.lifecycleState,
    ...(input.assistantTurnId
      ? { assistantTurnId: input.assistantTurnId }
      : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    latencyMs: elapsedMs(input.startedAt, input.now),
    attributes: redactAttributes(input.attributes),
  });
};

export const runtimeEventAttributes = (event: RuntimeEvent): JsonObject => {
  switch (event.type) {
    case "runtime.started":
      return {
        eventType: event.type,
        providerId: event.providerId,
        modelId: event.modelId,
      };
    case "runtime.output_delta":
      return { eventType: event.type, output: event.content };
    case "runtime.reasoning":
      return { eventType: event.type, prompt: event.summary };
    case "runtime.tool_call":
      return {
        eventType: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        argumentsJson: event.argumentsJson,
      };
    case "runtime.tool_result":
      return {
        eventType: event.type,
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        status: event.status,
        resultJson: event.resultJson ?? null,
        errorCode: event.errorCode ?? null,
      };
    case "runtime.completed":
      return { eventType: event.type, finishReason: event.finishReason };
    case "runtime.error":
      return {
        eventType: event.type,
        errorCode: event.code,
        message: safeJsonPrimitive(event.message),
        retryable: event.retryable,
      };
  }
};

export const terminalErrorCode = (
  events: readonly SidechatStreamEvent[],
): string | undefined => {
  const terminal = events.at(-1);
  return terminal?.type === SIDECHAT_EVENT_TYPES.ERROR
    ? terminal.code
    : undefined;
};

const elapsedMs = (startedAt: string, now: string): number => {
  const started = Date.parse(startedAt);
  const ended = Date.parse(now);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  return Math.max(0, ended - started);
};
