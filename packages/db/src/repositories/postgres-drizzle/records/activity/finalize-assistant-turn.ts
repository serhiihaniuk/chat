import { and, eq } from "drizzle-orm";

import { assistantTurns } from "#drizzle/schema";
import { toMessageId } from "#schema-contract";
import type { SidechatRepositories } from "../../../contract.js";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../../errors.js";
import { one, optional } from "../../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { insertConversationMessageInTransaction } from "../conversations.js";
import { toAssistantTurnRecord } from "../records.js";
import { notifyTurnActivity } from "./turn-activity-notification.js";

/**
 * PostgreSQL checks `assistant_message_id` when the turn is updated, so insert
 * the message first. The locked turn row lets only one racing caller do that;
 * the message, terminal update, and notification then commit or roll back together.
 */
export const createFinalizeAssistantTurn = ({
  db,
}: PostgresDrizzleRepositoryContext): SidechatRepositories["finalizeAssistantTurn"] =>
  async function finalizeAssistantTurn(command) {
    const outcome = await db.transaction(async (transaction) => {
      const current = one(
        await transaction
          .select()
          .from(assistantTurns)
          .where(
            and(
              eq(assistantTurns.workspaceId, command.workspaceId),
              eq(assistantTurns.assistantTurnId, command.assistantTurnId),
            ),
          )
          .limit(1)
          .for("update"),
        DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
        "Assistant turn does not exist in the requested workspace.",
      );
      if (current.status !== "open") {
        return { row: current, claimed: false } as const;
      }

      if (command.assistantMessage) {
        const message = await insertConversationMessageInTransaction(transaction, {
          workspaceId: current.workspaceId,
          subjectId: current.subjectId,
          conversationId: current.conversationId,
          messageId: toMessageId(command.assistantMessage.messageId),
          role: "assistant",
          parts: command.assistantMessage.parts,
          metadataJson: command.assistantMessage.metadataJson,
          now: command.now,
        });
        if (!message) {
          throw new DbRepositoryError(
            DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
            "Assistant output id conflicts with an existing message.",
          );
        }
      }

      const terminal = one(
        await transaction
          .update(assistantTurns)
          .set({
            status: command.status,
            finishReason: optional(command.finishReason),
            errorCode: optional(command.errorCode),
            assistantMessageId: optional(command.assistantMessage?.messageId),
            inputTokens: command.usage.inputTokens,
            outputTokens: command.usage.outputTokens,
            totalTokens: command.usage.totalTokens,
            reasoningTokens: command.usage.reasoningTokens,
            cachedInputTokens: command.usage.cachedInputTokens,
            completedAt: command.now,
          })
          .where(
            and(
              eq(assistantTurns.workspaceId, command.workspaceId),
              eq(assistantTurns.assistantTurnId, command.assistantTurnId),
              eq(assistantTurns.status, "open"),
            ),
          )
          .returning(),
        DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
        "Assistant turn lost its terminal claim while locked.",
      );
      await notifyTurnActivity(transaction, terminal);
      return { row: terminal, claimed: true } as const;
    });
    return {
      record: toAssistantTurnRecord(outcome.row),
      claimed: outcome.claimed,
    };
  };
