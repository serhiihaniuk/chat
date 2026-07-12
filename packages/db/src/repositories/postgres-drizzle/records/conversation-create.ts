import { and, eq, type SQL } from "drizzle-orm";

import { conversations } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import { DB_REPOSITORY_ERROR_CODES } from "../../errors.js";
import { one, result } from "../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import { toConversationRecord } from "./records.js";

/**
 * Create-or-get one conversation.
 *
 * A follow-up turn continues an existing conversation by id; a conversationless first
 * turn (or its retry) creates/dedupes on the request-derived `conversation_key`.
 */
export const createOrGetConversationRecord =
  ({
    db,
    ids,
  }: PostgresDrizzleRepositoryContext): SidechatRepositories["createOrGetConversation"] =>
  async (command) => {
    // Follow-up turn: return the conversation by its real id. Its stored key can differ
    // from this request's key (a conversationless conversation is keyed by request id),
    // so the key-scoped upsert below would otherwise miss it and hit conversations_pkey.
    if (command.conversationId) {
      const byId = await findScopedConversation(
        db,
        command,
        eq(conversations.conversationId, command.conversationId),
      );
      if (byId[0]) return result(toConversationRecord(byId[0]), false);
    }

    const inserted = await db
      .insert(conversations)
      .values({
        conversationId: command.conversationId ?? ids.next("conversation"),
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

    const existing = await findScopedConversation(
      db,
      command,
      eq(conversations.conversationKey, command.conversationKey),
    );
    return result(
      toConversationRecord(
        one(
          existing,
          DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
          "Conversation conflict returned no existing record.",
        ),
      ),
      false,
    );
  };

// One scoped conversation read, shared by the by-id (follow-up turn) and by-key
// (re-read after a lost create race) lookups.
const findScopedConversation = (
  db: PostgresDrizzleRepositoryContext["db"],
  scope: { readonly workspaceId: string; readonly subjectId: string },
  match: SQL,
) =>
  db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, scope.workspaceId),
        eq(conversations.subjectId, scope.subjectId),
        match,
      ),
    )
    .limit(1);
