import type { ChatClient } from "@side-chat/chat-client";
import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type HostContext,
} from "@side-chat/chat-protocol";
import type { HostBridge } from "@side-chat/host-bridge";

import { dispatchHostCommandResult } from "./host-command-flow.js";
import type { WidgetAction } from "#features/conversation/model/conversation-state";

export type RunChatStreamOptions = {
  readonly client: ChatClient;
  readonly dispatch: (action: WidgetAction) => void;
  readonly hostBridge?: Pick<HostBridge, "getContext" | "dispatchCommand">;
  readonly message: string;
  readonly requestFactory: (
    message: string,
    hostContext?: HostContext,
  ) => ChatStreamRequest;
};

export const runChatStream = async ({
  client,
  dispatch,
  hostBridge,
  message,
  requestFactory,
}: RunChatStreamOptions): Promise<void> => {
  try {
    const hostContext = hostBridge
      ? await hostBridge.getContext({ requestId: createId("host-request") })
      : undefined;
    const request = requestFactory(message, hostContext);
    dispatch({ type: "submit", request });
    const result = await client.streamChat(request);

    for await (const event of result.events) {
      dispatch({ type: "stream_event", event });
      if (event.type === "sidechat.host_command") {
        dispatchHostCommandResult(hostBridge, dispatch, event);
      }
    }
  } catch (error) {
    dispatch({ type: "stream_failed", message: readErrorMessage(error) });
  }
};

export const createDefaultRequest = (
  message: string,
  hostContext?: HostContext,
): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId: createId("request"),
  message: {
    id: createId("message"),
    role: "user",
    content: message,
  },
  ...(hostContext ? { hostContext } : {}),
});

const createId = (prefix: string): string => {
  const randomId =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${randomId}`;
};

const readErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";
