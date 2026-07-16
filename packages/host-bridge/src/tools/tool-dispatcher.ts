import {
  supportsTool,
  type HostCapabilities,
  type HostToolCall,
} from "./tool-capability.js";
import {
  createFailedToolResult,
  createUnsupportedToolResult,
  type HostToolResult,
} from "./tool-result.js";

export type HostToolDispatcher = Readonly<{
  dispatchToolCall: (toolCall: HostToolCall) => Promise<HostToolResult>;
}>;

export async function dispatchSupportedToolCall(
  dispatcher: HostToolDispatcher,
  capabilities: HostCapabilities,
  toolCall: HostToolCall,
): Promise<HostToolResult> {
  if (!supportsTool(capabilities, toolCall)) return createUnsupportedToolResult(toolCall);
  try {
    return await dispatcher.dispatchToolCall(toolCall);
  } catch {
    return createFailedToolResult(toolCall);
  }
}
