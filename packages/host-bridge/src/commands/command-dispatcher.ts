import { supportsCommand, type HostCapabilities, type HostCommand } from "./capability.js";
import {
  createFailedResult,
  createUnsupportedResult,
  type HostCommandResult,
} from "./command-result.js";

/** Host implementation that performs one already capability-checked command. */
export type HostCommandDispatcher = {
  readonly dispatchCommand: (command: HostCommand) => Promise<HostCommandResult>;
};

export const dispatchSupportedCommand = async (
  dispatcher: HostCommandDispatcher,
  capabilities: HostCapabilities,
  command: HostCommand,
): Promise<HostCommandResult> => {
  if (!supportsCommand(capabilities, command)) {
    return createUnsupportedResult(command);
  }

  try {
    return await dispatcher.dispatchCommand(command);
  } catch {
    return createFailedResult(command);
  }
};
