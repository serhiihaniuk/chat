import {
  SIDECHAT_EVENT_TYPES,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import { PartnerAiCoreError } from "#errors";
import type { ClockPort, IdGeneratorPort, RuntimeEvent } from "#ports";
import type { StreamChatInput } from "./stream-chat.js";

type EventMappingPorts = {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
};

export const mapRuntimeEvent = (
  event: RuntimeEvent,
  request: ChatStreamRequest,
  ports: EventMappingPorts,
  sequence: number,
): SidechatStreamEvent | undefined => {
  const base = {
    protocolVersion: request.protocolVersion,
    eventId: ports.ids.nextEventId(),
    assistantTurnId: event.assistantTurnId,
    sequence,
    createdAt: ports.clock.now(),
  } as const;

  switch (event.type) {
    case "runtime.started":
      return undefined;
    case "runtime.output_delta":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.DELTA,
        content: event.content,
      };
    case "runtime.activity":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.ACTIVITY,
        activityId: event.activityId,
        activityKind: event.activityKind,
        status: event.status,
        title: event.title,
        ...(event.body ? { body: event.body } : {}),
        ...(event.details ? { details: event.details } : {}),
      };
    case "runtime.completed":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.COMPLETED,
        finishReason: event.finishReason,
        ...(event.usage ? { usage: event.usage } : {}),
      };
    case "runtime.error":
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.ERROR,
        code: mapRuntimeErrorCode(event.code),
        message: event.message,
        retryable: event.retryable,
      };
  }
};

export const createErrorEvent = (
  input: StreamChatInput,
  assistantTurnId: string,
  sequence: number,
  ports: EventMappingPorts,
  error: Pick<PartnerAiCoreError, "protocolCode" | "message" | "retryable">,
): SidechatStreamEvent => ({
  protocolVersion: input.request.protocolVersion,
  type: SIDECHAT_EVENT_TYPES.ERROR,
  eventId: ports.ids.nextEventId(),
  assistantTurnId,
  sequence,
  createdAt: ports.clock.now(),
  code: error.protocolCode,
  message: error.message,
  retryable: error.retryable,
});

export const mapUnknownRuntimeError = (error: unknown): PartnerAiCoreError =>
  error instanceof PartnerAiCoreError
    ? error
    : new PartnerAiCoreError(
        "runtime_failed",
        error instanceof Error ? error.message : "Runtime failed",
        "provider_failed",
        true,
      );

export const validateExactlyOneTerminal = (events: readonly SidechatStreamEvent[]): void => {
  try {
    validateSidechatEventSequence(events);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid stream";
    throw new PartnerAiCoreError("invalid_runtime_sequence", message, "malformed_stream");
  }
};

const mapRuntimeErrorCode = (code: string): ProtocolErrorCode => {
  if (code === "tool_failed") return "tool_failed";
  if (code === "timeout") return "timeout";
  if (code === "aborted") return "aborted";
  return "provider_failed";
};
