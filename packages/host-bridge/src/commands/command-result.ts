import { omitUndefinedProperties, type JsonObject } from "@side-chat/shared";

import type { HostCommand, HostToolCall } from "./capability.js";

export const HOST_COMMAND_RESULT_STATUSES = {
  APPLIED: "applied",
  REJECTED: "rejected",
  UNSUPPORTED: "unsupported",
  FAILED: "failed",
  TIMED_OUT: "timed_out",
} as const;

export type HostCommandResultStatus =
  (typeof HOST_COMMAND_RESULT_STATUSES)[keyof typeof HOST_COMMAND_RESULT_STATUSES];

/**
 * Browser-host outcome recorded for one model-requested host command.
 *
 * Results are safe to return to the widget timeline. `resolvedAt` is an ISO-8601
 * timestamp, `resultCode` is the host's stable diagnostic code, and `data` must
 * contain only JSON-safe values that the host is willing to disclose in the UI.
 */
export type HostCommandResult = {
  readonly commandId: string;
  readonly commandName: string;
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt: string;
  readonly data?: JsonObject;
};

/** Provider-free outcome for one native workflow client-tool call. */
export type HostToolResult = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt: string;
  readonly data?: JsonObject;
};

/** Host-owned outcome fields used to settle a dispatched command. */
export type CommandResultInput = {
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt?: string | undefined;
  readonly data?: JsonObject | undefined;
};

export type ToolResultInput = {
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt?: string | undefined;
  readonly data?: JsonObject | undefined;
};

/** Create the complete timeline result while preserving the command identity. */
export const createCommandResult = (
  command: HostCommand,
  input: CommandResultInput,
): HostCommandResult =>
  omitUndefinedProperties({
    commandId: command.commandId,
    commandName: command.commandName,
    status: input.status,
    resultCode: input.resultCode,
    resolvedAt: input.resolvedAt ?? new Date().toISOString(),
    data: input.data,
  });

export const createUnsupportedResult = (
  command: HostCommand,
  resultCode = "unsupported_command",
): HostCommandResult =>
  createCommandResult(command, {
    status: "unsupported",
    resultCode,
  });

export const createRejectedResult = (
  command: HostCommand,
  resultCode: string,
): HostCommandResult =>
  createCommandResult(command, {
    status: "rejected",
    resultCode,
  });

export const createFailedResult = (
  command: HostCommand,
  resultCode = "host_command_failed",
): HostCommandResult =>
  createCommandResult(command, {
    status: "failed",
    resultCode,
  });

export const createToolResult = (
  toolCall: HostToolCall,
  input: ToolResultInput,
): HostToolResult =>
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
  resultCode = "unsupported_command",
): HostToolResult =>
  createToolResult(toolCall, {
    status: "unsupported",
    resultCode,
  });

export const createFailedToolResult = (
  toolCall: HostToolCall,
  resultCode = "host_tool_failed",
): HostToolResult =>
  createToolResult(toolCall, {
    status: "failed",
    resultCode,
  });
