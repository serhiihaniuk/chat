import { omitUndefinedProperties, type JsonObject } from "@side-chat/shared";

import type { HostToolCall } from "./tool-capability.js";

export const HOST_TOOL_RESULT_STATUSES = {
  APPLIED: "applied",
  REJECTED: "rejected",
  UNSUPPORTED: "unsupported",
  FAILED: "failed",
  TIMED_OUT: "timed_out",
} as const;

export type HostToolResultStatus =
  (typeof HOST_TOOL_RESULT_STATUSES)[keyof typeof HOST_TOOL_RESULT_STATUSES];

/**
 * Normalized result returned across the host/widget boundary and then to the model.
 *
 * `resultCode` is a stable, display-safe host code. Optional `data` must be
 * bounded JSON intended for the model, never credentials or private host state.
 */
export type HostToolResult = Readonly<{
  toolCallId: string;
  toolName: string;
  status: HostToolResultStatus;
  resultCode: string;
  resolvedAt: string;
  data?: JsonObject | undefined;
}>;

export type ToolResultInput = Readonly<{
  status: HostToolResultStatus;
  resultCode: string;
  resolvedAt?: string | undefined;
  data?: JsonObject | undefined;
}>;

/** Bind a host outcome to its call identity and stamp omitted resolution time locally. */
export const createToolResult = (toolCall: HostToolCall, input: ToolResultInput): HostToolResult =>
  omitUndefinedProperties({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    status: input.status,
    resultCode: input.resultCode,
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
    data: input.data,
  });

export const createUnsupportedToolResult = (
  toolCall: HostToolCall,
  resultCode = "unsupported_tool",
): HostToolResult => createToolResult(toolCall, { status: "unsupported", resultCode });

export const createFailedToolResult = (
  toolCall: HostToolCall,
  resultCode = "host_tool_failed",
): HostToolResult => createToolResult(toolCall, { status: "failed", resultCode });
