import { staticSubjectId } from "#adapters/auth/static-token-authorizer";
import type { SeedConversation } from "#adapters/persistence/in-memory-turn-state";

export const LOCAL_CHAT_CONVERSATION_ID = "conversation-1";

export function localChatConversation(workspaceId: string): SeedConversation {
  return {
    conversationId: LOCAL_CHAT_CONVERSATION_ID,
    workspaceId,
    subjectId: staticSubjectId(workspaceId),
  };
}
