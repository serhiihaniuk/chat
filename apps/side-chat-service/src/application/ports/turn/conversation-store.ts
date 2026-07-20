import type { AuthContext } from "@side-chat/side-chat-server";

export interface ConversationStore {
  assertOwned(auth: AuthContext, conversationId: string): Promise<void>;
}
