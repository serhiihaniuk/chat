import type {
  HostContextSnapshot,
  ModelSelection,
  SidechatStreamErrorEvent,
} from "@side-chat/shared-protocol";

export type SideChatError = SidechatStreamErrorEvent;

export const randomId = () =>
  `client-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const deriveHistoryEndpoint = (apiEndpoint: string): string => {
  const streamSuffix = "/chat/stream";
  if (apiEndpoint.endsWith(streamSuffix)) {
    return `${apiEndpoint.slice(0, -streamSuffix.length)}/chat/history`;
  }

  return `${apiEndpoint}/chat/history`;
};

export const deriveUsageEndpoint = (apiEndpoint: string): string => {
  const streamSuffix = "/chat/stream";
  if (apiEndpoint.endsWith(streamSuffix)) {
    return `${apiEndpoint.slice(0, -streamSuffix.length)}/chat/usage`;
  }

  return `${apiEndpoint}/chat/usage`;
};

export const requestError = (
  message: string,
  requestId: string,
): SideChatError => ({
  type: "sidechat.error",
  requestId,
  code: "REQUEST_FAILED",
  message,
  retryable: true,
});

export type CreateChatRequestPayloadInput = {
  workspaceId: string;
  conversationId?: string;
  messageId: string;
  content: string;
  model: ModelSelection;
  hostContext?: HostContextSnapshot;
};

export const createChatRequestPayload = ({
  workspaceId,
  conversationId,
  messageId,
  content,
  model,
  hostContext,
}: CreateChatRequestPayloadInput) => ({
  workspaceId,
  conversationId,
  message: { id: messageId, role: "user" as const, content },
  model,
  ...(hostContext ? { hostContext } : {}),
});
