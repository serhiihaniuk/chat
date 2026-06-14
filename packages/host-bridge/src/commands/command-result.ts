import { optionalField, type JsonObject } from "@side-chat/shared";

import type { HostCommand } from "./capability.js";

export type HostCommandResultStatus =
  | "applied"
  | "rejected"
  | "unsupported"
  | "failed"
  | "timed_out";

export type HostCommandResult = {
  readonly commandId: string;
  readonly commandName: string;
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt: string;
  readonly data?: JsonObject;
};

export type CommandResultInput = {
  readonly status: HostCommandResultStatus;
  readonly resultCode: string;
  readonly resolvedAt?: string;
  readonly data?: JsonObject;
};

export const createCommandResult = (
  command: HostCommand,
  input: CommandResultInput,
): HostCommandResult => ({
  commandId: command.commandId,
  commandName: command.commandName,
  status: input.status,
  resultCode: input.resultCode,
  resolvedAt: input.resolvedAt ?? new Date().toISOString(),
  ...optionalField("data", input.data),
});

export const createUnsupportedResult = (
  command: HostCommand,
  resultCode = "unsupported_command",
): HostCommandResult =>
  createCommandResult(command, {
    status: "unsupported",
    resultCode,
  });

export const createRejectedResult = (command: HostCommand, resultCode: string): HostCommandResult =>
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
