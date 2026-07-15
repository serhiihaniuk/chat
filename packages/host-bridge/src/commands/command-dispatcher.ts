import {
  supportsCommand,
  supportsTool,
  type HostCapabilities,
  type HostCommand,
  type HostToolCall,
} from "./capability.js";
import {
  createFailedToolResult,
  createFailedResult,
  createUnsupportedToolResult,
  createUnsupportedResult,
  type HostToolResult,
  type HostCommandResult,
} from "./command-result.js";

/** Host implementation that performs one already capability-checked command. */
export type HostCommandDispatcher = {
  readonly dispatchCommand: (command: HostCommand) => Promise<HostCommandResult>;
};

/** Host implementation that performs one capability-checked native tool call. */
export type HostToolDispatcher = {
  readonly dispatchToolCall: (toolCall: HostToolCall) => Promise<HostToolResult>;
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

export const dispatchSupportedToolCall = async (
  dispatcher: HostToolDispatcher,
  capabilities: HostCapabilities,
  toolCall: HostToolCall,
): Promise<HostToolResult> => {
  if (!supportsTool(capabilities, toolCall)) return createUnsupportedToolResult(toolCall);

  try {
    return await dispatcher.dispatchToolCall(toolCall);
  } catch {
    return createFailedToolResult(toolCall);
  }
};
