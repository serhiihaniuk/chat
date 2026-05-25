import { createChatClient, type ChatClient } from "@side-chat/chat-client";

import type { SideChatWidgetProps } from "./widget.types.js";

export const resolveWidgetClient = (props: SideChatWidgetProps): ChatClient => {
  if (props.client) return props.client;
  if ("apiEndpoint" in props && props.apiEndpoint) {
    const streamPath =
      props.transport?.streamPath ?? resolveStreamPath(props.apiEndpoint);
    return createChatClient({
      baseUrl: resolveBaseUrl(props.apiEndpoint),
      ...(props.transport?.historyPath
        ? { historyPath: props.transport.historyPath }
        : {}),
      ...(streamPath ? { streamPath } : {}),
      ...(props.transport?.usagePath
        ? { usagePath: props.transport.usagePath }
        : {}),
    });
  }
  throw new Error("SideChatWidget requires either client or apiEndpoint.");
};

const resolveBaseUrl = (apiEndpoint: string): string => {
  const marker = "/chat/stream";
  if (!apiEndpoint.endsWith(marker)) return apiEndpoint;
  return apiEndpoint.slice(0, -marker.length) || "/";
};

const resolveStreamPath = (apiEndpoint: string): string | undefined =>
  apiEndpoint.endsWith("/chat/stream") ? "/chat/stream" : undefined;
