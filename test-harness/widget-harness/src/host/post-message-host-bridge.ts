import { isRecord, type HostContext } from "@side-chat/chat-protocol";
import {
  createCommandResult,
  HOST_COMMAND_RESULT_STATUSES,
  createToolResult,
  toHostCommand,
  type HostBridge,
  type HostCapabilities,
  type HostCommand,
  type HostCommandResult,
  type HostToolCall,
  type HostToolResult,
} from "@side-chat/host-bridge";

/**
 * Host bridge that forwards commands across an iframe boundary.
 *
 * When the widget runs inside an iframe, the host page lives in the parent
 * window. This bridge posts each dispatched command to `window.parent` and
 * resolves once the parent replies with a result for the same `commandId`. The
 * parent performs the host action and owns the records; the widget only sees the
 * returned {@link HostCommandResult}. A reply that never arrives resolves to a
 * `timed_out` result so the timeline never hangs.
 *
 * Creation touches no browser globals, so it is safe to build during server
 * render; `window` is read only when a command is actually dispatched.
 */
export const HOST_COMMAND_MESSAGE_TYPE = "sidechat.widget.hostCommand";
export const HOST_COMMAND_RESULT_MESSAGE_TYPE =
  "sidechat.widget.hostCommandResult";
export const HOST_TOOL_CALL_MESSAGE_TYPE = "sidechat.widget.hostToolCall";
export const HOST_TOOL_RESULT_MESSAGE_TYPE = "sidechat.widget.hostToolResult";
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

const COMMAND_STATUSES: readonly HostCommandResult["status"][] = Object.values(
  HOST_COMMAND_RESULT_STATUSES,
);

export type PostMessageHostBridgeOptions = {
  readonly context: HostContext;
  readonly capabilities?: HostCapabilities | undefined;
  readonly timeoutMs?: number;
};

type HostCommandResultPayload = {
  readonly status: HostCommandResult["status"];
  readonly resultCode: string;
};

type HostToolResultPayload = HostCommandResultPayload;

export const createPostMessageHostBridge = (
  options: PostMessageHostBridgeOptions,
): Pick<HostBridge, "getContext" | "dispatchCommand" | "dispatchToolCall"> &
  Partial<Pick<HostBridge, "getCapabilities">> => {
  const bridge = {
    getContext: () => Promise.resolve(options.context),
    dispatchCommand: (event: Parameters<HostBridge["dispatchCommand"]>[0]) =>
      requestHostCommandFromParent(
        toHostCommand(event),
        options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      ),
    dispatchToolCall: (toolCall: HostToolCall) =>
      requestHostToolFromParent(
        toolCall,
        options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
      ),
  } satisfies Pick<
    HostBridge,
    "getContext" | "dispatchCommand" | "dispatchToolCall"
  >;
  const capabilities = options.capabilities;
  if (!capabilities) return bridge;
  return {
    ...bridge,
    getCapabilities: () => Promise.resolve(capabilities),
  };
};

const requestHostCommandFromParent = (
  command: HostCommand,
  timeoutMs: number,
): Promise<HostCommandResult> =>
  new Promise((resolve) => {
    const origin = window.location.origin;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      resolve(
        createCommandResult(command, {
          status: "timed_out",
          resultCode: "host_command_timeout",
        }),
      );
    }, timeoutMs);
    window.addEventListener(
      "message",
      (message: MessageEvent<unknown>) => {
        const reply = readResultPayload(message, origin, command.commandId);
        if (!reply) return;
        clearTimeout(timer);
        controller.abort();
        resolve(createCommandResult(command, reply));
      },
      { signal: controller.signal },
    );
    window.parent.postMessage(
      {
        type: HOST_COMMAND_MESSAGE_TYPE,
        command: {
          commandId: command.commandId,
          commandName: command.commandName,
          payload: command.payload,
        },
      },
      origin,
    );
  });

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
        const reply = readToolResultPayload(
          message,
          origin,
          toolCall.toolCallId,
        );
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

const readResultPayload = (
  message: MessageEvent<unknown>,
  origin: string,
  commandId: string,
): HostCommandResultPayload | undefined => {
  if (message.origin !== origin) return undefined;
  const data = message.data;
  if (!isRecord(data) || data["type"] !== HOST_COMMAND_RESULT_MESSAGE_TYPE)
    return undefined;
  if (data["commandId"] !== commandId || !isRecord(data["result"]))
    return undefined;
  const result = data["result"];
  if (
    !isCommandStatus(result["status"]) ||
    typeof result["resultCode"] !== "string"
  )
    return undefined;
  return { status: result["status"], resultCode: result["resultCode"] };
};

const readToolResultPayload = (
  message: MessageEvent<unknown>,
  origin: string,
  toolCallId: string,
): HostToolResultPayload | undefined => {
  if (message.origin !== origin) return undefined;
  const data = message.data;
  if (!isRecord(data) || data["type"] !== HOST_TOOL_RESULT_MESSAGE_TYPE)
    return undefined;
  if (data["toolCallId"] !== toolCallId || !isRecord(data["result"]))
    return undefined;
  const result = data["result"];
  if (
    !isCommandStatus(result["status"]) ||
    typeof result["resultCode"] !== "string"
  ) {
    return undefined;
  }
  return { status: result["status"], resultCode: result["resultCode"] };
};

const isCommandStatus = (
  value: unknown,
): value is HostCommandResult["status"] =>
  typeof value === "string" &&
  COMMAND_STATUSES.some((status) => status === value);
