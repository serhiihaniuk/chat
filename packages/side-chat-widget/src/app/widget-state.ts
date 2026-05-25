import {
  SIDECHAT_PROTOCOL_VERSION,
  type ChatStreamRequest,
  type HostContext,
  type ToolEvent,
} from "@side-chat/chat-protocol";

import type {
  HostCommandView,
  WidgetMessage,
  WidgetStatus,
} from "./widget.types.js";

export const createDefaultRequest = ({
  assistantProfileId,
  content,
  hostContext,
  messageId,
  requestId,
}: {
  readonly assistantProfileId: string | undefined;
  readonly content: string;
  readonly hostContext: HostContext | undefined;
  readonly messageId: string;
  readonly requestId: string;
}): ChatStreamRequest => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  requestId,
  ...(assistantProfileId ? { assistantProfileId } : {}),
  message: {
    id: messageId,
    role: "user",
    content,
  },
  ...(hostContext ? { hostContext } : {}),
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
  reasoning: [],
  tools: [],
  hostCommands: [],
  isStreaming,
});

export const updateMessage = (
  messages: readonly WidgetMessage[],
  id: string,
  update: (message: WidgetMessage) => WidgetMessage,
): WidgetMessage[] =>
  messages.map((message) => (message.id === id ? update(message) : message));

export const updateHostCommand = (
  messages: readonly WidgetMessage[],
  messageId: string,
  commandId: string,
  nextCommand: HostCommandView,
): WidgetMessage[] =>
  updateMessage(messages, messageId, (message) => ({
    ...message,
    hostCommands: message.hostCommands.map((command) =>
      command.event.commandId === commandId ? nextCommand : command,
    ),
  }));

export const upsertToolEvent = (
  tools: readonly ToolEvent[],
  event: ToolEvent,
): ToolEvent[] => {
  const index = tools.findIndex((tool) => tool.toolCallId === event.toolCallId);
  if (index < 0) return [...tools, event];
  return tools.map((tool, currentIndex) =>
    currentIndex === index ? event : tool,
  );
};

export const toPromptStatusProps = (
  status: WidgetStatus,
): { readonly status?: "submitted" | "streaming" | "error" } => {
  if (status === "submitted") return { status: "submitted" };
  if (status === "streaming") return { status: "streaming" };
  if (status === "error") return { status: "error" };
  return {};
};

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Chat request failed";

export const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};
