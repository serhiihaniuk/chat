import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatModelPreference,
  type ChatStreamRequest,
  type HostContext,
  type RequestHostCommand,
  type UsageMetadata,
} from "@side-chat/chat-protocol";
import { omitUndefinedProperties } from "@side-chat/shared";

import { createEmptyActivityTimeline, type WidgetActivityTimeline } from "./activity.js";

export type WidgetStatus = "idle" | "submitted" | "streaming" | "error";
export type WidgetUsage = UsageMetadata;

export type WidgetMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly activity: WidgetActivityTimeline;
  readonly isStreaming?: boolean | undefined;
};

export type WidgetChatRequestInput = {
  readonly turnProfileId: string | undefined;
  readonly conversationId: string | undefined;
  readonly hostContext: HostContext | undefined;
  readonly hostCommands?: readonly RequestHostCommand[] | undefined;
  readonly enabledToolNames?: readonly string[] | undefined;
  readonly message: string;
  readonly messageId: string;
  readonly model?: ChatModelPreference | undefined;
  readonly requestId: string;
};

export const createDefaultRequest = ({
  turnProfileId,
  conversationId,
  content,
  hostContext,
  hostCommands,
  enabledToolNames,
  messageId,
  model,
  requestId,
}: {
  readonly turnProfileId?: string | undefined;
  readonly conversationId?: string | undefined;
  readonly content: string;
  readonly hostContext?: HostContext | undefined;
  readonly hostCommands?: readonly RequestHostCommand[] | undefined;
  readonly enabledToolNames?: readonly string[] | undefined;
  readonly messageId: string;
  readonly model?: ChatModelPreference | undefined;
  readonly requestId: string;
}): ChatStreamRequest =>
  omitUndefinedProperties({
    protocolVersion: SIDECHAT_PROTOCOL_VERSION,
    requestId,
    conversationId: conversationId === "" ? undefined : conversationId,
    turnProfileId: turnProfileId === "" ? undefined : turnProfileId,
    model,
    message: {
      id: messageId,
      content,
    },
    hostContext,
    hostCommands,
    enabledToolNames,
  });

export const createWidgetChatRequest = ({
  turnProfileId,
  conversationId,
  hostContext,
  hostCommands,
  enabledToolNames,
  message,
  messageId,
  model,
  requestId,
}: WidgetChatRequestInput): ChatStreamRequest =>
  createDefaultRequest({
    content: message,
    messageId,
    requestId,
    turnProfileId,
    conversationId,
    hostContext,
    hostCommands,
    enabledToolNames,
    model,
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

export const findLastUserMessage = (
  messages: readonly WidgetMessage[],
): WidgetMessage | undefined => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
};

export const messagesBeforeMessage = (
  messages: readonly WidgetMessage[],
  target: WidgetMessage,
): WidgetMessage[] => messages.slice(0, messages.lastIndexOf(target));

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";

export const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};
