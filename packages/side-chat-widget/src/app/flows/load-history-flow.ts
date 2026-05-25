import type { ChatClient } from "@side-chat/chat-client";

import type { WidgetAction } from "#features/conversation/model/conversation-state";
import { fromHistoryMessage } from "#entities/message/projection";

export type LoadHistoryOptions = {
  readonly client: ChatClient;
  readonly conversationId?: string;
  readonly dispatch: (action: WidgetAction) => void;
  readonly limit?: number;
};

export const loadConversationHistory = async ({
  client,
  conversationId,
  dispatch,
  limit,
}: LoadHistoryOptions): Promise<void> => {
  if (!conversationId || !client.readHistory) {
    return;
  }

  dispatch({ type: "history_loading" });
  try {
    const history = await client.readHistory(
      conversationId,
      limit === undefined ? {} : { limit },
    );
    dispatch({
      type: "history_loaded",
      conversationId: history.conversationId,
      messages: history.messages.map(fromHistoryMessage),
    });
  } catch (error) {
    dispatch({ type: "history_failed", message: readErrorMessage(error) });
  }
};

const readErrorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : "Failed to load conversation history";
