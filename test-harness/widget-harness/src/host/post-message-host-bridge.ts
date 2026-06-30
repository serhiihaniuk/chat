import type { HostContext } from "@side-chat/chat-protocol";
import {
  createCommandResult,
  toHostCommand,
  type HostBridge,
  type HostCommand,
  type HostCommandResult,
} from "@side-chat/host-bridge";
import { isRecord } from "@side-chat/shared";

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
export const HOST_COMMAND_RESULT_MESSAGE_TYPE = "sidechat.widget.hostCommandResult";
const DEFAULT_COMMAND_TIMEOUT_MS = 5_000;

const COMMAND_STATUSES: readonly HostCommandResult["status"][] = [
  "applied",
  "rejected",
  "unsupported",
  "failed",
  "timed_out",
];

export type PostMessageHostBridgeOptions = {
  readonly context: HostContext;
  readonly timeoutMs?: number;
};

type HostCommandResultPayload = {
  readonly status: HostCommandResult["status"];
  readonly resultCode: string;
};

export const createPostMessageHostBridge = (
  options: PostMessageHostBridgeOptions,
): Pick<HostBridge, "getContext" | "dispatchCommand"> => ({
  getContext: () => Promise.resolve(options.context),
  dispatchCommand: (event) =>
    requestHostCommandFromParent(
      toHostCommand(event),
      options.timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS,
    ),
});

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
        createCommandResult(command, { status: "timed_out", resultCode: "host_command_timeout" }),
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

const readResultPayload = (
  message: MessageEvent<unknown>,
  origin: string,
  commandId: string,
): HostCommandResultPayload | undefined => {
  if (message.origin !== origin) return undefined;
  const data = message.data;
  if (!isRecord(data) || data["type"] !== HOST_COMMAND_RESULT_MESSAGE_TYPE) return undefined;
  if (data["commandId"] !== commandId || !isRecord(data["result"])) return undefined;
  const result = data["result"];
  if (!isCommandStatus(result["status"]) || typeof result["resultCode"] !== "string")
    return undefined;
  return { status: result["status"], resultCode: result["resultCode"] };
};

const isCommandStatus = (value: unknown): value is HostCommandResult["status"] =>
  typeof value === "string" && (COMMAND_STATUSES as readonly string[]).includes(value);
