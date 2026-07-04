import { and, asc, eq, gt, type SQL } from "drizzle-orm";

import { messages } from "#drizzle/schema";
import type { ConversationRecord, ConversationSummaryRecord } from "#schema-contract";
import type { PostgresDrizzleRepositoryContext } from "./context.js";

/**
 * Resolve a conversation's summary title, falling back to its first user message.
 *
 * A conversation with no explicit title shows the first user message as its list
 * label; the reset cutoff is honored so a cleared conversation titles from the
 * first message after the cut, not a hidden one.
 */
export const readConversationSummaryTitle = async (
  db: PostgresDrizzleRepositoryContext["db"],
  conversation: ConversationRecord,
): Promise<ConversationSummaryRecord> => {
  if (conversation.titleText) return conversation;

  const titleMessage = await db
    .select({ contentText: messages.contentText })
    .from(messages)
    .where(buildTitleMessageWhere(conversation))
    .orderBy(asc(messages.sequenceIndex))
    .limit(1);
  const titleText = titleMessage[0]?.contentText;
  return titleText ? { ...conversation, titleText } : { ...conversation };
};

const buildTitleMessageWhere = (conversation: ConversationRecord): SQL => {
  const clauses = [
    eq(messages.workspaceId, conversation.workspaceId),
    eq(messages.conversationId, conversation.conversationId),
    eq(messages.role, "user"),
  ];
  if (conversation.historyCutoffSequenceIndex !== undefined) {
    clauses.push(gt(messages.sequenceIndex, conversation.historyCutoffSequenceIndex));
  }
  return and(...clauses)!;
};
