import type { ChatClient } from "@side-chat/chat-client";

import type { WidgetAction } from "#features/conversation/model/conversation-state";

export type ResetConversationOptions = {
  readonly client: ChatClient;
  readonly conversationId?: string;
  readonly dispatch: (action: WidgetAction) => void;
};

export const resetConversation = async ({
  client,
  conversationId,
  dispatch,
}: ResetConversationOptions): Promise<void> => {
  try {
    if (conversationId && client.resetHistory) {
      await client.resetHistory(conversationId);
    }
    dispatch({ type: "reset" });
  } catch (error) {
    dispatch({ type: "stream_failed", message: readErrorMessage(error) });
  }
};

const readErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Conversation reset failed";
