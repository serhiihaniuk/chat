import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { conversations, messages } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import { createOrGetConversationRecord } from "./conversation-create.js";
import { readConversationSummaryTitle } from "./conversation-summaries.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import {
  buildHistoryWhere,
  requireSubjectConversation,
  toConversationRecord,
  toMessageRecord,
} from "./records.js";
import { one, result } from "../../repository-utils.js";

type ConversationRepository = Pick<
  SidechatRepositories,
  | "appendMessage"
  | "createOrGetConversation"
  | "readConversationHistory"
  | "listConversations"
  | "prepareConversationTitle"
  | "resetConversation"
>;

type AppendMessageCommand = Parameters<ConversationRepository["appendMessage"]>[0];

/**
 * Build the Postgres conversation repository from named operations.
 *
 * Message insertion owns its transaction and idempotency race. The other
 * operations stay independent so a maintainer can enter through one behavior
 * without reading the entire repository object literal.
 */
export const createPostgresDrizzleConversationRepository = (
  context: PostgresDrizzleRepositoryContext,
): ConversationRepository => ({
  createOrGetConversation: createOrGetConversationRecord(context),
  appendMessage: createAppendMessage(context),
  readConversationHistory: createReadConversationHistory(context),
  listConversations: createListConversations(context),
  prepareConversationTitle: createPrepareConversationTitle(context),
  resetConversation: createResetConversation(context),
});

const createAppendMessage = (
  context: PostgresDrizzleRepositoryContext,
): ConversationRepository["appendMessage"] => {
  const { db } = context;
  return async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );

    const existing = await readMessageByIdempotencyKey(context, command);
    if (existing[0]) return result(toMessageRecord(existing[0]), false);

    const inserted = await insertConversationMessage(context, command);
    if (inserted) return result(toMessageRecord(inserted), true);

    const repeated = await readMessageByIdempotencyKey(context, command);
    return result(
      toMessageRecord(
        one(
          repeated,
          "record_not_found",
          "Message idempotency conflict did not return an existing record.",
        ),
      ),
      false,
    );
  };
};

const readMessageByIdempotencyKey = (
  { db }: PostgresDrizzleRepositoryContext,
  command: AppendMessageCommand,
) =>
  db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.workspaceId, command.workspaceId),
        eq(messages.idempotencyKey, command.idempotencyKey.value),
      ),
    )
    .limit(1);

/** Insert one message while serializing sequence allocation per conversation. */
const insertConversationMessage = (
  { db, ids }: PostgresDrizzleRepositoryContext,
  command: AppendMessageCommand,
) =>
  db.transaction(async (transaction) => {
    // Lock before reading max(sequence_index): concurrent appends then allocate
    // distinct sequence indexes, while an idempotency loser observes the winner.
    await transaction
      .select({ conversationId: conversations.conversationId })
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.conversationId, command.conversationId),
        ),
      )
      .for("update");
    const [nextSequence] = await transaction
      .select({ value: sql<number>`coalesce(max(${messages.sequenceIndex}), -1) + 1` })
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, command.workspaceId),
          eq(messages.conversationId, command.conversationId),
        ),
      );
    const sequenceIndex = Number(nextSequence?.value ?? 0);
    const [message] = await transaction
      .insert(messages)
      .values({
        messageId: ids.next("message"),
        conversationId: command.conversationId,
        workspaceId: command.workspaceId,
        role: command.role,
        contentText: command.contentText,
        metadataJson: command.metadataJson,
        sequenceIndex,
        idempotencyKey: command.idempotencyKey.value,
        createdAt: command.now,
      })
      .onConflictDoNothing({ target: [messages.workspaceId, messages.idempotencyKey] })
      .returning();
    if (!message) return undefined;

    await transaction
      .update(conversations)
      .set({ status: "active", updatedAt: command.now, lastMessageAt: command.now })
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.conversationId, command.conversationId),
        ),
      );
    return message;
  });

const createReadConversationHistory =
  ({ db }: PostgresDrizzleRepositoryContext): ConversationRepository["readConversationHistory"] =>
  async (command) => {
    const conversation = await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const afterSequenceIndex = historyLowerBound(
      command.afterSequenceIndex,
      conversation.historyCutoffSequenceIndex,
    );
    const rows = await db
      .select()
      .from(messages)
      .where(
        buildHistoryWhere(
          command.workspaceId,
          command.conversationId,
          afterSequenceIndex,
          command.beforeSequenceIndex,
        ),
      )
      .orderBy(desc(messages.sequenceIndex))
      .limit(command.limit);
    return rows.reverse().map(toMessageRecord);
  };

const createListConversations =
  ({ db }: PostgresDrizzleRepositoryContext): ConversationRepository["listConversations"] =>
  async (command) => {
    const rows = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.subjectId, command.subjectId),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt))
      .limit(command.limit);
    // N+1: one title-fallback read per untitled conversation, bounded by the
    // sidebar `limit` (25). Fold into a lateral join only if that limit grows.
    return Promise.all(
      rows.map((row) => readConversationSummaryTitle(db, toConversationRecord(row))),
    );
  };

const createPrepareConversationTitle =
  ({ db }: PostgresDrizzleRepositoryContext): ConversationRepository["prepareConversationTitle"] =>
  async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const rows = await db
      .update(conversations)
      .set({
        titleText: command.titleText,
        updatedAt: command.now,
      })
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.subjectId, command.subjectId),
          eq(conversations.conversationId, command.conversationId),
          isNull(conversations.titleText),
        ),
      )
      .returning();
    if (rows[0]) return toConversationRecord(rows[0]);

    return requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
  };

const createResetConversation =
  ({ db }: PostgresDrizzleRepositoryContext): ConversationRepository["resetConversation"] =>
  async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const [lastMessage] = await db
      .select({ sequenceIndex: messages.sequenceIndex })
      .from(messages)
      .where(buildHistoryWhere(command.workspaceId, command.conversationId, undefined, undefined))
      .orderBy(desc(messages.sequenceIndex))
      .limit(1);
    const rows = await db
      .update(conversations)
      .set({
        status: "reset",
        historyCutoffSequenceIndex: lastMessage?.sequenceIndex ?? null,
        updatedAt: command.now,
      })
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.conversationId, command.conversationId),
        ),
      )
      .returning();
    return toConversationRecord(
      one(rows, "record_not_found", "Conversation reset did not update."),
    );
  };

const historyLowerBound = (
  requestedAfter: number | undefined,
  resetCutoff: number | undefined,
): number | undefined => {
  if (requestedAfter === undefined) return resetCutoff;
  if (resetCutoff === undefined) return requestedAfter;
  return Math.max(requestedAfter, resetCutoff);
};
