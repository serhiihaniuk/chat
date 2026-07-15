import { desc } from "drizzle-orm";

import { messages } from "#drizzle/schema";
import type { SidechatRepositories } from "../../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { buildHistoryWhere, requireSubjectConversation, toMessageRecord } from "../records.js";

export const createReadConversationHistory =
  ({ db }: PostgresDrizzleRepositoryContext): SidechatRepositories["readConversationHistory"] =>
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

function historyLowerBound(
  requestedAfter: number | undefined,
  resetCutoff: number | undefined,
): number | undefined {
  if (requestedAfter === undefined) return resetCutoff;
  if (resetCutoff === undefined) return requestedAfter;
  return Math.max(requestedAfter, resetCutoff);
}
