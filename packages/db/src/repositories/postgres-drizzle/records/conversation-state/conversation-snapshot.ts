import { and, desc, eq, inArray } from "drizzle-orm";

import { assistantTurns, messages } from "#drizzle/schema";
import type { SidechatRepositories } from "../../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { workflowRunsRead } from "../../workflow/schema.js";
import {
  buildHistoryWhere,
  requireSubjectConversation,
  toAssistantTurnRecord,
  toMessageRecord,
} from "../records.js";

/** Read latest history and resumable identity from one repeatable-read snapshot. */
export const createReadConversationSnapshot =
  ({ db }: PostgresDrizzleRepositoryContext): SidechatRepositories["readConversationSnapshot"] =>
  (command) =>
    db.transaction(
      async (transaction) => {
        const conversation = await requireSubjectConversation(
          transaction,
          command.workspaceId,
          command.subjectId,
          command.conversationId,
        );
        const messageRows = await transaction
          .select()
          .from(messages)
          .where(
            buildHistoryWhere(
              command.workspaceId,
              command.conversationId,
              conversation.historyCutoffSequenceIndex,
              undefined,
            ),
          )
          .orderBy(desc(messages.sequenceIndex))
          .limit(command.limit);
        const activeRows = await transaction
          .select({ turn: assistantTurns })
          .from(assistantTurns)
          .innerJoin(workflowRunsRead, eq(workflowRunsRead.id, assistantTurns.runId))
          .where(
            and(
              eq(assistantTurns.workspaceId, command.workspaceId),
              eq(assistantTurns.subjectId, command.subjectId),
              eq(assistantTurns.conversationId, command.conversationId),
              eq(assistantTurns.status, "open"),
              inArray(workflowRunsRead.status, ["pending", "running"]),
            ),
          )
          .orderBy(desc(assistantTurns.startedAt))
          .limit(1);
        return {
          messages: messageRows.reverse().map(toMessageRecord),
          ...(activeRows[0] === undefined
            ? {}
            : { activeTurn: toAssistantTurnRecord(activeRows[0].turn) }),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
