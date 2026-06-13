import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type HostContext,
  type UsageMetadata,
} from "@side-chat/chat-protocol";

import { createEmptyActivityTimeline, type WidgetActivityTimeline } from "./activity.js";

export type WidgetStatus = "idle" | "submitted" | "streaming" | "error";
export type WidgetUsage = UsageMetadata;

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly activity: WidgetActivityTimeline;
  readonly isStreaming?: boolean;
};

export type WidgetChatRequestInput = {
  readonly assistantProfileId: string | undefined;
  readonly conversationId: string | undefined;
  readonly hostContext: HostContext | undefined;
  readonly message: string;
  readonly messageId: string;
  readonly requestId: string;
};

export const createDefaultRequest = ({
  assistantProfileId,
  conversationId,
  content,
  hostContext,
  messageId,
  requestId,
}: {
  readonly assistantProfileId?: string;
  readonly conversationId?: string;
  readonly content: string;
  readonly hostContext?: HostContext;
  readonly messageId: string;
  readonly requestId: string;
}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId,
  ...conversationIdField(conversationId),
  ...assistantProfileIdField(assistantProfileId),
  message: {
    id: messageId,
    role: "user",
    content,
  },
  ...hostContextField(hostContext),
});

export const createWidgetChatRequest = ({
  assistantProfileId,
  conversationId,
  hostContext,
  message,
  messageId,
  requestId,
}: WidgetChatRequestInput): ChatStreamRequest =>
  createDefaultRequest({
    content: message,
    messageId,
    requestId,
    ...assistantProfileIdField(assistantProfileId),
    ...conversationIdField(conversationId),
    ...hostContextField(hostContext),
  });

export const createWidgetMessage = (
  id: string,
  role: WidgetMessage["role"],
  content: string,
  isStreaming = false,
): WidgetMessage => ({
  id,
  role,
  content,
  activity: createEmptyActivityTimeline(),
  isStreaming,
});

export const updateMessage = (
  messages: readonly WidgetMessage[],
  id: string,
  update: (message: WidgetMessage) => WidgetMessage,
): WidgetMessage[] => messages.map((message) => (message.id === id ? update(message) : message));

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";

export const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};

const conversationIdField = (
  conversationId: string | undefined,
): { readonly conversationId?: string } => (conversationId ? { conversationId } : {});

const assistantProfileIdField = (
  assistantProfileId: string | undefined,
): { readonly assistantProfileId?: string } => (assistantProfileId ? { assistantProfileId } : {});

const hostContextField = (
  hostContext: HostContext | undefined,
): { readonly hostContext?: HostContext } => (hostContext ? { hostContext } : {});
