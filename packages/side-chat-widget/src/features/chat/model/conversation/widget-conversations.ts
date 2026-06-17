import type { ReadHistoryResult } from "#entities/conversation";
import { createWidgetMessage, type WidgetMessage } from "#entities/chat";

export const toWidgetHistoryMessages = (history: ReadHistoryResult): readonly WidgetMessage[] =>
  history.messages.flatMap((message) =>
    message.role === "user" || message.role === "assistant"
      ? [createWidgetMessage(message.id, message.role, message.content)]
      : [],
  );
