import { and, desc, eq, sql } from "drizzle-orm";

import { conversations, messages } from "#drizzle/schema";
import type { SidechatRepositories } from "./contract.js";
import type { PostgresDrizzleRepositoryContext } from "./postgres-drizzle-context.js";
import {
  buildHistoryWhere,
  one,
  requireSubjectConversation,
  toConversationRecord,
  toMessageRecord,
} from "./postgres-drizzle-records.js";
import { result } from "./repository-utils.js";

export const createPostgresDrizzleConversationRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  "appendMessage" | "createOrGetConversation" | "readConversationHistory" | "resetConversation"
> => ({
  createOrGetConversation: async (command) => {
    const inserted = await db
      .insert(conversations)
      .values({
        conversationId: ids.next("conversation"),
        workspaceId: command.workspaceId,
        subjectId: command.subjectId,
        conversationKey: command.conversationKey,
        status: "active",
        createdByActorId: command.actorId,
        createdAt: command.now,
        updatedAt: command.now,
        lastMessageAt: command.now,
      })
      .onConflictDoNothing({
        target: [conversations.workspaceId, conversations.subjectId, conversations.conversationKey],
      })
      .returning();
    if (inserted[0]) return result(toConversationRecord(inserted[0]), true);

    const existing = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.workspaceId, command.workspaceId),
          eq(conversations.subjectId, command.subjectId),
          eq(conversations.conversationKey, command.conversationKey),
        ),
      )
      .limit(1);
    return result(
      toConversationRecord(
        one(
          existing,
          "record_not_found",
          "Conversation unique conflict did not return an existing record.",
        ),
      ),
      false,
    );
  },
  appendMessage: async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );

    const existing = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, command.workspaceId),
          eq(messages.idempotencyKey, command.idempotencyKey.value),
        ),
      )
      .limit(1);
    if (existing[0]) return result(toMessageRecord(existing[0]), false);

    const inserted = await db.transaction(async (transaction) => {
      const [nextSequence] = await transaction
        .select({
          value: sql<number>`coalesce(max(${messages.sequenceIndex}), -1) + 1`,
        })
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
        .onConflictDoNothing({
          target: [messages.workspaceId, messages.idempotencyKey],
        })
        .returning();
      if (!message) return undefined;
      await transaction
        .update(conversations)
        .set({ updatedAt: command.now, lastMessageAt: command.now })
        .where(
          and(
            eq(conversations.workspaceId, command.workspaceId),
            eq(conversations.conversationId, command.conversationId),
          ),
        );
      return message;
    });
    if (inserted) return result(toMessageRecord(inserted), true);

    const repeated = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.workspaceId, command.workspaceId),
          eq(messages.idempotencyKey, command.idempotencyKey.value),
        ),
      )
      .limit(1);
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
  },
  readConversationHistory: async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const rows = await db
      .select()
      .from(messages)
      .where(
        buildHistoryWhere(command.workspaceId, command.conversationId, command.beforeSequenceIndex),
      )
      .orderBy(desc(messages.sequenceIndex))
      .limit(command.limit);
    return rows.reverse().map(toMessageRecord);
  },
  resetConversation: async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const rows = await db
      .update(conversations)
      .set({ status: "reset", updatedAt: command.now })
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
  },
});
