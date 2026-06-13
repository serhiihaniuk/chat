import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  validateSidechatEventSequence,
  type ChatStreamRequest,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
} from "@side-chat/chat-protocol";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type ClockPort,
  type IdGeneratorPort,
  type RuntimeEvent,
  type RuntimeErrorEvent,
} from "#ports";
import type { StreamChatInput } from "../stream-chat-types.js";

type RuntimeErrorCode = RuntimeErrorEvent["code"];

const RUNTIME_ERROR_CODE_TOOL_FAILED = RUNTIME_ERROR_CODES.TOOL_FAILED satisfies RuntimeErrorCode;
const RUNTIME_ERROR_CODE_TIMEOUT = RUNTIME_ERROR_CODES.TIMEOUT satisfies RuntimeErrorCode;
const RUNTIME_ERROR_CODE_ABORTED = RUNTIME_ERROR_CODES.ABORTED satisfies RuntimeErrorCode;

type EventMappingPorts = {
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
};

/**
 * Map provider-neutral runtime events into the public sidechat.v1 protocol.
 *
 * Core deliberately drops `runtime.started` because the browser already gets
 * `sidechat.started` from the prepared turn. Every other runtime event becomes
 * visible output/activity or the one terminal protocol event.
 */
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
    case RUNTIME_EVENT_TYPES.STARTED:
      return undefined;
    case RUNTIME_EVENT_TYPES.OUTPUT_DELTA:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.DELTA,
        content: event.content,
      };
    case RUNTIME_EVENT_TYPES.ACTIVITY:
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
    case RUNTIME_EVENT_TYPES.COMPLETED:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.COMPLETED,
        finishReason: event.finishReason,
        ...(event.usage ? { usage: event.usage } : {}),
      };
    case RUNTIME_EVENT_TYPES.ERROR:
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

/**
 * Normalize unexpected runtime failures into a retryable provider error.
 *
 * Expected failures should already be PartnerAiCoreError. This fallback protects
 * the stream contract when an adapter throws an unknown value or a provider
 * stream fails outside its typed error channel.
 */
export const mapUnknownRuntimeError = (error: unknown): PartnerAiCoreError =>
  error instanceof PartnerAiCoreError
    ? error
    : new PartnerAiCoreError(
        PARTNER_AI_CORE_ERROR_CODES.RUNTIME_FAILED,
        error instanceof Error ? error.message : "Runtime failed",
        PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.PROVIDER_FAILED,
        true,
      );

/**
 * Enforce the browser protocol after runtime mapping has finished.
 *
 * The runtime can produce deltas, activities, completion, or error, but the
 * public stream is only valid if exactly one terminal sidechat event exists.
 */
export const validateExactlyOneTerminal = (events: readonly SidechatStreamEvent[]): void => {
  try {
    validateSidechatEventSequence(events);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid stream";
    throw new PartnerAiCoreError(
      PARTNER_AI_CORE_ERROR_CODES.INVALID_RUNTIME_SEQUENCE,
      message,
      PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.MALFORMED_STREAM,
    );
  }
};

/**
 * Runtime errors are internal names; protocol errors are browser-facing names.
 *
 * Only supported runtime error codes become specific protocol codes. Unknown
 * runtime failures map to provider_failed so the browser does not learn
 * provider or adapter implementation details.
 */
const mapRuntimeErrorCode = (code: string): ProtocolErrorCode => {
  if (code === RUNTIME_ERROR_CODE_TOOL_FAILED) return PROTOCOL_ERROR_CODES.TOOL_FAILED;
  if (code === RUNTIME_ERROR_CODE_TIMEOUT) return PROTOCOL_ERROR_CODES.TIMEOUT;
  if (code === RUNTIME_ERROR_CODE_ABORTED) return PROTOCOL_ERROR_CODES.ABORTED;
  return PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.PROVIDER_FAILED;
};
