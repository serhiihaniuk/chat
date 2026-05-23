import type {
  ChatStreamRequest,
  HistoryMessage,
} from "@side-chat/chat-protocol";

import type { WidgetMessage } from "./model.js";

export const fromRequestMessage = (
  request: ChatStreamRequest,
  sequence: number,
): WidgetMessage => ({
  content: request.message.content,
  id: request.message.id,
  role: request.message.role,
  sequence,
});

export const fromHistoryMessage = (message: HistoryMessage): WidgetMessage => ({
  content: message.content,
  id: message.id,
  role: message.role,
  sequence: message.sequence,
});

export const appendAssistantDelta = (
  messages: readonly WidgetMessage[],
  content: string,
): readonly WidgetMessage[] => {
  const last = messages.at(-1);
  if (last?.role === "assistant") {
    return [
      ...messages.slice(0, -1),
      { ...last, content: `${last.content}${content}` },
    ];
  }

  return [
    ...messages,
    {
      content,
      id: `assistant-${messages.length}`,
      role: "assistant",
      sequence: messages.length,
    },
  ];
};
