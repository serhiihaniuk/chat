import {
  createFailedToolResult,
  createUnsupportedToolResult,
  supportsTool,
  type HostCapabilities,
  type HostToolCall,
  type HostToolResult,
  type WidgetHostBridge,
} from "@side-chat/host-bridge";
import { toJsonObject } from "@side-chat/shared";

import { postWorkflowClientToolOutput, type WorkflowChatClient } from "#entities/workflow-chat";

/** Result codes for the ways host dispatch can fail before the tool ever runs. */
const HOST_TOOL_DISPATCH_FAILURE = {
  BRIDGE_UNAVAILABLE: "host_bridge_unavailable",
  CAPABILITIES_UNAVAILABLE: "host_capabilities_unavailable",
  CAPABILITIES_FAILED: "host_capabilities_failed",
  DISPATCH_UNAVAILABLE: "host_tool_dispatch_unavailable",
} as const;

export type WorkflowClientToolCall = Readonly<{
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
  readonly dynamic?: boolean | undefined;
}>;

export type WorkflowClientToolDispatchOutcome = Readonly<{
  readonly result: HostToolResult;
  readonly outputPosted: boolean;
}>;

/**
 * Resolve, execute, and settle one native dynamic tool call.
 *
 * Every branch returns a safe host result. The hook can therefore await this
 * function without allowing bridge or output-route failures to become React
 * errors. The server remains responsible for continuation after the output is
 * durable; this function never mutates chat outputs or resubmits the chat.
 */
export async function dispatchWorkflowClientTool({
  client,
  hostBridge,
  runId,
  toolCall,
}: {
  readonly client: WorkflowChatClient;
  readonly hostBridge: WidgetHostBridge | undefined;
  readonly runId: string | undefined;
  readonly toolCall: WorkflowClientToolCall;
}): Promise<WorkflowClientToolDispatchOutcome> {
  const hostToolCall: HostToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toJsonObject(toolCall.input),
  };
  const result = await resolveAndDispatch(hostBridge, hostToolCall);
  if (!runId) return { result, outputPosted: false };

  try {
    await postWorkflowClientToolOutput(client, runId, toolCall.toolCallId, result);
    return { result, outputPosted: true };
  } catch {
    return { result, outputPosted: false };
  }
}

async function resolveAndDispatch(
  hostBridge: WidgetHostBridge | undefined,
  toolCall: HostToolCall,
): Promise<HostToolResult> {
  if (!hostBridge)
    return createFailedToolResult(toolCall, HOST_TOOL_DISPATCH_FAILURE.BRIDGE_UNAVAILABLE);

  let capabilities: HostCapabilities;
  try {
    if (!hostBridge.getCapabilities) {
      return createFailedToolResult(toolCall, HOST_TOOL_DISPATCH_FAILURE.CAPABILITIES_UNAVAILABLE);
    }
    capabilities = await hostBridge.getCapabilities();
  } catch {
    return createFailedToolResult(toolCall, HOST_TOOL_DISPATCH_FAILURE.CAPABILITIES_FAILED);
  }

  try {
    if (!supportsTool(capabilities, toolCall)) return createUnsupportedToolResult(toolCall);
    if (!hostBridge.dispatchToolCall) {
      return createFailedToolResult(toolCall, HOST_TOOL_DISPATCH_FAILURE.DISPATCH_UNAVAILABLE);
    }
    return await hostBridge.dispatchToolCall(toolCall);
  } catch {
    return createFailedToolResult(toolCall);
  }
}
