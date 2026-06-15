import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type ChatStreamRequest,
  type ActivityDetails,
  type ActivityToolDetails,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
  toActivityId,
} from "@side-chat/chat-protocol";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type RuntimeActivityDetails,
  type RuntimeActivityToolDetails,
  type RuntimeEvent,
  type RuntimeErrorEvent,
} from "@side-chat/agent-runtime";
import { optionalField } from "@side-chat/shared";
import {
  PARTNER_AI_CORE_ERROR_CODES,
  PARTNER_AI_CORE_PROTOCOL_ERROR_CODES,
  PartnerAiCoreError,
} from "#errors";
import { type ClockPort, type IdGeneratorPort } from "#ports";
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
 * Convert runtime events into the sidechat.v1 events sent to the browser.
 *
 * `runtime.started` is skipped because the browser already received
 * `sidechat.started` when the turn was prepared.
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
        activityId: toActivityId(event.activityId),
        activityKind: event.activityKind,
        status: event.status,
        title: event.title,
        ...optionalField("body", event.body || undefined),
        ...optionalField(
          "details",
          event.details ? mapRuntimeActivityDetails(event.details) : undefined,
        ),
      };
    case RUNTIME_EVENT_TYPES.COMPLETED:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.COMPLETED,
        finishReason: event.finishReason,
        ...optionalField("usage", event.usage),
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
 * Convert an unexpected runtime failure to the public error the browser can see.
 *
 * Normal failures should already be PartnerAiCoreError. This fallback is for
 * thrown values and provider streams that broke outside typed handling.
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
 * Hide internal runtime error names from the browser.
 *
 * Known failures keep their useful public code. Everything else becomes
 * provider_failed so adapter/provider details do not leak into sidechat.v1.
 */
const mapRuntimeErrorCode = (code: string): ProtocolErrorCode => {
  if (code === RUNTIME_ERROR_CODE_TOOL_FAILED) return PROTOCOL_ERROR_CODES.TOOL_FAILED;
  if (code === RUNTIME_ERROR_CODE_TIMEOUT) return PROTOCOL_ERROR_CODES.TIMEOUT;
  if (code === RUNTIME_ERROR_CODE_ABORTED) return PROTOCOL_ERROR_CODES.ABORTED;
  return PARTNER_AI_CORE_PROTOCOL_ERROR_CODES.PROVIDER_FAILED;
};

const mapRuntimeActivityDetails = (details: RuntimeActivityDetails): ActivityDetails => ({
  ...optionalField("sources", details.sources),
  ...optionalField("images", details.images),
  ...optionalField("tool", details.tool ? mapRuntimeToolDetails(details.tool) : undefined),
});

const mapRuntimeToolDetails = (tool: RuntimeActivityToolDetails): ActivityToolDetails => ({
  toolCallId: tool.toolCallId,
  toolName: tool.toolName,
  ...optionalField("input", tool.input),
  ...optionalField("result", tool.result),
  ...optionalField("sources", tool.sources),
  ...optionalField("errorCode", tool.errorCode ? mapRuntimeErrorCode(tool.errorCode) : undefined),
});
