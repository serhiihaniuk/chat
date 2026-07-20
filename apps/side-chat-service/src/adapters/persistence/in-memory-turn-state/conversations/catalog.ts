import type { StoredConversationMessage } from "#application/ports/conversation-query-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "@side-chat/side-chat-server";

import { sameOwner } from "../active-turns.js";

export type SeedConversation = Readonly<{
  conversationId: string;
  workspaceId: string;
  subjectId: string;
  title?: string | undefined;
}>;

/** Owns the local conversation catalog and its ordered persisted messages. */
export class InMemoryConversationCatalog {
  readonly conversations = new Map<string, SeedConversation>();
  private readonly messages = new Map<string, StoredConversationMessage[]>();

  constructor(seedConversations: readonly SeedConversation[]) {
    for (const conversation of seedConversations) {
      this.conversations.set(conversation.conversationId, conversation);
    }
  }

  requireOwned(auth: AuthContext, conversationId: string): SeedConversation {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.NOT_FOUND, "Conversation not found");
    }
    if (!sameOwner(auth, conversation)) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.FORBIDDEN, "Conversation access denied");
    }
    return conversation;
  }

  assertOwnerWhenExists(auth: AuthContext, conversationId: string): void {
    const conversation = this.conversations.get(conversationId);
    if (conversation && !sameOwner(auth, conversation)) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.FORBIDDEN, "Conversation access denied");
    }
  }

  createIfMissing(auth: AuthContext, conversationId: string): void {
    if (this.conversations.has(conversationId)) return;
    this.conversations.set(conversationId, {
      conversationId,
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    });
  }

  prepareTitle(auth: AuthContext, conversationId: string, title: string): void {
    const conversation = this.requireOwned(auth, conversationId);
    if (conversation.title !== undefined) return;
    this.conversations.set(conversationId, { ...conversation, title });
  }

  readMessages(conversationId: string): readonly StoredConversationMessage[] {
    return this.messages.get(conversationId) ?? [];
  }

  appendMessage(conversationId: string, message: StoredConversationMessage): void {
    const messages = this.messages.get(conversationId) ?? [];
    this.messages.set(conversationId, [...messages, message]);
  }
}
