import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  type ChatStreamRequest,
  type ActivityDetails,
  type ActivityImage,
  type ActivitySource,
  type ActivityToolDetails,
  type ActivityHostCommandDetails,
  type CompletedEvent,
  type ProtocolErrorCode,
  type SidechatStreamEvent,
  toActivityId,
  toHostCommandId,
} from "@side-chat/chat-protocol";
import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeActivityDetails,
  type RuntimeActivityImage,
  type RuntimeActivitySource,
  type RuntimeActivityToolDetails,
  type RuntimeActivityHostCommandDetails,
  type RuntimeEvent,
  type RuntimeErrorEvent,
  type RuntimeFinishReason,
} from "@side-chat/ai-runtime-contract";
import { omitUndefinedProperties } from "@side-chat/shared";
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
      return omitUndefinedProperties({
        ...base,
        type: SIDECHAT_EVENT_TYPES.ACTIVITY,
        activityId: toActivityId(event.activityId),
        activityKind: event.activityKind,
        status: event.status,
        title: event.title,
        body: event.body === "" ? undefined : event.body,
        details: event.details ? mapRuntimeActivityDetails(event.details) : undefined,
      });
    case RUNTIME_EVENT_TYPES.COMPLETED:
      return omitUndefinedProperties({
        ...base,
        type: SIDECHAT_EVENT_TYPES.COMPLETED,
        finishReason: mapCompletedFinishReason(event.finishReason),
        usage: event.usage,
      });
    case RUNTIME_EVENT_TYPES.ERROR:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.ERROR,
        code: mapRuntimeErrorCode(event.code),
        message: event.message,
        retryable: event.retryable,
      };
    case RUNTIME_EVENT_TYPES.BLOCKED:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.BLOCKED,
        reason: event.reason,
        publicMessage: event.publicMessage,
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
 * Map a runtime finish reason to the browser protocol's smaller set.
 *
 * `tool_step_limit` (the tool loop hit its step cap) is a truncation, so it maps
 * to `length` — the browser's truncation finish reason — so a capped turn is
 * observable without a browser-facing enum the widget does not need. The runtime
 * keeps the distinct reason for server-side observability. Other reasons share the
 * protocol's strings.
 */
const mapCompletedFinishReason = (reason: RuntimeFinishReason): CompletedEvent["finishReason"] =>
  reason === RUNTIME_FINISH_REASONS.TOOL_STEP_LIMIT ? "length" : reason;

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

const mapRuntimeActivityDetails = (details: RuntimeActivityDetails): ActivityDetails =>
  omitUndefinedProperties({
    sources: details.sources?.map(mapRuntimeActivitySource),
    images: details.images?.map(mapRuntimeActivityImage),
    tool: details.tool ? mapRuntimeToolDetails(details.tool) : undefined,
    hostCommand: details.hostCommand
      ? mapRuntimeHostCommandDetails(details.hostCommand)
      : undefined,
  });

const mapRuntimeHostCommandDetails = (
  hostCommand: RuntimeActivityHostCommandDetails,
): ActivityHostCommandDetails => ({
  commandId: toHostCommandId(hostCommand.commandId),
  commandName: hostCommand.commandName,
  payload: hostCommand.payload,
});

const mapRuntimeToolDetails = (tool: RuntimeActivityToolDetails): ActivityToolDetails =>
  omitUndefinedProperties({
    toolCallId: tool.toolCallId,
    toolName: tool.toolName,
    input: tool.input,
    result: tool.result,
    sources: tool.sources?.map(mapRuntimeActivitySource),
    errorCode: tool.errorCode ? mapRuntimeErrorCode(tool.errorCode) : undefined,
  });

const mapRuntimeActivitySource = (source: RuntimeActivitySource): ActivitySource =>
  omitUndefinedProperties({
    label: source.label,
    url: source.url === "" ? undefined : source.url,
  });

const mapRuntimeActivityImage = (image: RuntimeActivityImage): ActivityImage =>
  omitUndefinedProperties({
    alt: image.alt,
    caption: image.caption === "" ? undefined : image.caption,
    mediaType: image.mediaType,
    data: image.data,
  });
