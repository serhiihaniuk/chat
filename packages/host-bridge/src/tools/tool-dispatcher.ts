/**
 * Enforces the host capability-routing boundary around tool dispatch.
 *
 * Raw host exceptions never cross into the widget or model; callers receive one
 * fixed safe failure result and keep detailed diagnostics on the host side.
 */
import { supportsTool, type HostCapabilities, type HostToolCall } from "./tool-capability.js";
import {
  createFailedToolResult,
  createUnsupportedToolResult,
  type HostToolResult,
} from "./tool-result.js";

export type HostToolDispatcher = Readonly<{
  dispatchToolCall: (toolCall: HostToolCall) => Promise<HostToolResult>;
}>;

/** Route a supported call and normalize unsupported or thrown outcomes. */
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
