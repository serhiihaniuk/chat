import type { AuthContext } from "#domain/auth-context";

export interface ConversationStore {
  assertOwned(auth: AuthContext, conversationId: string): Promise<void>;
}
