import type { JsonObject } from "@side-chat/shared";
import { and, asc, eq, gt, type SQL } from "drizzle-orm";

import { messages } from "#drizzle/schema";
import type { ConversationRecord, ConversationSummaryRecord } from "#schema-contract";
import type { PostgresDrizzleRepositoryContext } from "./context.js";

/**
 * Resolve a conversation's summary title, falling back to its first user message.
 *
 * A conversation with no explicit title shows the first user message as its list
 * label; the reset cutoff is honored so a cleared conversation titles from the
 * first message after the cut, not a hidden one. The label is the first text part
 * of that message's `parts` — the one durable message body in v7.
 */
export const readConversationSummaryTitle = async (
  db: PostgresDrizzleRepositoryContext["db"],
  conversation: ConversationRecord,
): Promise<ConversationSummaryRecord> => {
  if (conversation.titleText) return conversation;

  const titleMessage = await db
    .select({ parts: messages.parts })
    .from(messages)
    .where(buildTitleMessageWhere(conversation))
    .orderBy(asc(messages.sequenceIndex))
    .limit(1);
  const titleText = firstTextPart(titleMessage[0]?.parts);
  return titleText ? { ...conversation, titleText } : { ...conversation };
};

/** The first `{ type: "text", text }` part's text, if the message has one. */
const firstTextPart = (parts: readonly JsonObject[] | undefined): string | undefined => {
  for (const part of parts ?? []) {
    if (part["type"] === "text" && typeof part["text"] === "string") return part["text"];
  }
  return undefined;
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
  const where = and(...clauses);
  if (!where) {
    throw new Error("Conversation title queries must always keep their identity constraints.");
  }
  return where;
};
