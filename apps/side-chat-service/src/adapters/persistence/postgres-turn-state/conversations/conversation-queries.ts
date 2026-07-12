import type { MessageRecord, SidechatRepositories } from "@side-chat/db";

import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  type ConversationHistoryPage,
  type ConversationHistoryQuery,
  type ConversationQueryStore,
  type StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import type { AuthContext } from "#domain/auth-context";

/** Map the read projection without exposing repository records to HTTP. */
export function createPostgresConversationQueries(
  repositories: SidechatRepositories,
): ConversationQueryStore {
  return {
    readHistory: (auth, conversationId, query) =>
      readHistoryPage(repositories, auth, conversationId, query),
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
      return {
        turnId: record.assistantTurnId,
        runId: record.runId,
        status: "running",
      };
    },
  };
}

/**
 * Read one backward page of history.
 *
 * History is anchored newest-first. The repository returns the newest N below the
 * `before` floor (`ORDER BY sequence_index DESC LIMIT N`, reversed to ascending),
 * so paging older means lowering the floor. Requesting one extra row detects
 * whether older history remains without a second count query: when the probe row
 * comes back it is the oldest of the batch, so it is dropped and the oldest
 * surviving row's sequence index becomes the next `before` cursor.
 */
async function readHistoryPage(
  repositories: SidechatRepositories,
  auth: AuthContext,
  conversationId: string,
  query: ConversationHistoryQuery | undefined,
): Promise<ConversationHistoryPage> {
  const limit = query?.limit ?? DEFAULT_HISTORY_PAGE_LIMIT;
  const records = await repositories.readConversationHistory({
    workspaceId: auth.workspaceId,
    subjectId: auth.subjectId,
    conversationId,
    limit: limit + 1,
    ...(query?.beforeSequenceIndex === undefined
      ? {}
      : { beforeSequenceIndex: query.beforeSequenceIndex }),
  });
  const hasMoreBefore = records.length > limit;
  const pageRecords = hasMoreBefore ? records.slice(1) : records;
  const nextBeforeSequenceIndex = hasMoreBefore ? pageRecords[0]?.sequenceIndex : undefined;
  return {
    messages: pageRecords.map(toStoredMessage),
    hasMoreBefore,
    ...(nextBeforeSequenceIndex === undefined ? {} : { nextBeforeSequenceIndex }),
  };
}

function toStoredMessage(record: MessageRecord): StoredConversationMessage {
  return {
    id: record.messageId,
    role: record.role,
    parts: record.parts,
    metadata: record.metadataJson,
  };
}
