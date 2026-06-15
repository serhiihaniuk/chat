import { Effect } from "effect";
import type {
  ConversationHistoryContextPort,
  PreparedHistoryMessage,
} from "@side-chat/partner-ai-core";
import type { MessageRecord, SidechatRepositories } from "@side-chat/db";

export const createRepositoryConversationHistoryContext = (
  repositories: SidechatRepositories,
): ConversationHistoryContextPort => ({
  readConversationHistory: (input) =>
    Effect.tryPromise({
      try: async () => {
        if (input.limit <= 0) return [];

        const records = await repositories.readConversationHistory({
          workspaceId: input.authContext.workspaceId,
          subjectId: input.authContext.subject.subjectId,
          conversationId: input.conversation.conversationId,
          limit: input.limit,
          beforeSequenceIndex: input.currentUserMessage.sequenceIndex,
          afterSequenceIndex: input.conversation.historyCutoffSequenceIndex,
        });

        return records.flatMap(toPreparedHistoryMessage);
      },
      catch: (error) => error,
    }),
});

const toPreparedHistoryMessage = (record: MessageRecord): readonly PreparedHistoryMessage[] => {
  if (!isConversationHistoryRole(record.role)) return [];

  return [
    {
      messageId: record.messageId,
      sequenceIndex: record.sequenceIndex,
      role: record.role,
      content: record.contentText,
      estimatedTokens: estimateTokens(record.contentText),
    },
  ];
};

const isConversationHistoryRole = (
  role: MessageRecord["role"],
): role is PreparedHistoryMessage["role"] => role === "user" || role === "assistant";

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));
