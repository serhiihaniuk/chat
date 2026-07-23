/**
 * Same-origin client-tool bridge used only by the iframe harness.
 *
 * Calls and replies are correlated by `toolCallId`; listeners are disposed after
 * one reply or a safe timeout. Production cross-origin integrations must use the
 * public host-bridge adapters with their own exact-origin policy.
 */
import { isRecord } from "@side-chat/shared";
import {
  createToolResult,
  HOST_TOOL_RESULT_STATUSES,
  type HostBridge,
  type HostCapabilities,
  type HostToolCall,
  type HostToolResult,
} from "@side-chat/host-bridge";

export const HOST_TOOL_CALL_MESSAGE_TYPE = "sidechat.widget.hostToolCall";
export const HOST_TOOL_RESULT_MESSAGE_TYPE = "sidechat.widget.hostToolResult";
const DEFAULT_TOOL_TIMEOUT_MS = 5_000;

const TOOL_STATUSES: readonly HostToolResult["status"][] = Object.values(HOST_TOOL_RESULT_STATUSES);

export type PostMessageHostBridgeOptions = {
  readonly capabilities?: HostCapabilities | undefined;
  readonly timeoutMs?: number;
};

type HostToolResultPayload = {
  readonly status: HostToolResult["status"];
  readonly resultCode: string;
};

export const createPostMessageHostBridge = (
  options: PostMessageHostBridgeOptions,
): Pick<HostBridge, "dispatchToolCall"> & Partial<Pick<HostBridge, "getCapabilities">> => {
  const bridge = {
    dispatchToolCall: (toolCall: HostToolCall) =>
      requestHostToolFromParent(toolCall, options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS),
  } satisfies Pick<HostBridge, "dispatchToolCall">;
  const capabilities = options.capabilities;
  if (!capabilities) return bridge;
  return {
    ...bridge,
    getCapabilities: () => Promise.resolve(capabilities),
  };
};

const requestHostToolFromParent = (
  toolCall: HostToolCall,
  timeoutMs: number,
): Promise<HostToolResult> =>
  new Promise((resolve) => {
    const origin = window.location.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve(
        createToolResult(toolCall, {
          status: "timed_out",
          resultCode: "host_tool_timeout",
        }),
      );
    }, timeoutMs);
    window.addEventListener(
      "message",
      (message: MessageEvent<unknown>) => {
        const reply = readToolResultPayload(message, origin, toolCall.toolCallId);
        if (!reply) return;
        clearTimeout(timer);
        controller.abort();
        resolve(createToolResult(toolCall, reply));
      },
      { signal: controller.signal },
    );
    window.parent.postMessage(
      {
        type: HOST_TOOL_CALL_MESSAGE_TYPE,
        toolCall: {
          toolCallId: toolCall.toolCallId,
          toolName: toolCall.toolName,
          input: toolCall.input,
        },
      },
      origin,
    );
  });

const readToolResultPayload = (
  message: MessageEvent<unknown>,
  origin: string,
  toolCallId: string,
): HostToolResultPayload | undefined => {
  if (message.origin !== origin) return undefined;
  const data = message.data;
  if (!isRecord(data) || data["type"] !== HOST_TOOL_RESULT_MESSAGE_TYPE) return undefined;
  if (data["toolCallId"] !== toolCallId || !isRecord(data["result"])) return undefined;
  const result = data["result"];
  if (!isToolStatus(result["status"]) || typeof result["resultCode"] !== "string") {
    return undefined;
  }
  return { status: result["status"], resultCode: result["resultCode"] };
};

const isToolStatus = (value: unknown): value is HostToolResult["status"] =>
  typeof value === "string" && TOOL_STATUSES.some((status) => status === value);
