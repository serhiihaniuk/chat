import type { SidechatRepositories } from "@side-chat/db";

import type { ConversationQueryStore } from "#application/ports/conversation-query-store";

/** Map the read projection without exposing repository records to HTTP. */
export function createPostgresConversationQueries(
  repositories: SidechatRepositories,
): ConversationQueryStore {
  return {
    readHistory: async (auth, conversationId) => {
      const records = await repositories.readConversationHistory({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
        limit: 100,
      });
      return records.map((record) => ({
        id: record.messageId,
        role: record.role,
        parts: record.parts,
        metadata: record.metadataJson,
      }));
    },
    listConversations: async (auth) => {
      const records = await repositories.listConversations({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        limit: 25,
      });
      return records.map((record) => ({
        id: record.conversationId,
        status: record.status,
        ...(record.titleText === undefined ? {} : { title: record.titleText }),
        lastMessageAt: record.lastMessageAt,
      }));
    },
    findActiveTurn: async (auth, conversationId) => {
      const record = await repositories.findActiveAssistantTurn({
        workspaceId: auth.workspaceId,
        subjectId: auth.subjectId,
        conversationId,
      });
      if (!record?.runId) return undefined;
      return { turnId: record.assistantTurnId, runId: record.runId, status: "running" };
    },
  };
}
