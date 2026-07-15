import type { SidechatRepositories } from "@side-chat/db";

import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";

/** Map the title enrichment port without exposing database records to application code. */
export function createPostgresConversationTitleStore(
  repositories: SidechatRepositories,
): ConversationTitleStore {
  return {
    readTitleEligibility: async (auth, conversationId) => {
      const conversation = await repositories.findConversation({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
      });
      if (!conversation) {
        throw new TurnRejectedError(TURN_REJECTION_CODES.NOT_FOUND, "Conversation not found");
      }
      return {
        eligible: conversation.titleText === undefined,
        ...(conversation.titleText === undefined ? {} : { existingTitle: conversation.titleText }),
      };
    },
    prepareConversationTitle: async (auth, conversationId, titleText) => {
      await repositories.prepareConversationTitle({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
        titleText,
        now: new Date().toISOString(),
      });
    },
    recordConversationTitleRun: async (auth, conversationId, runId) => {
      await repositories.recordConversationTitleRun({
        workspaceId: auth.workspaceId,
        conversationId,
        runId,
        now: new Date().toISOString(),
      });
    },
  };
}
