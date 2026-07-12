import { conversationTitleRuns } from "#drizzle/schema";

import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";

/** Record a title-generation run's conversation link, idempotent on the run id. */
export const createRecordConversationTitleRun =
  ({ db }: PostgresDrizzleRepositoryContext): SidechatRepositories["recordConversationTitleRun"] =>
  async (command) => {
    await db
      .insert(conversationTitleRuns)
      .values({
        runId: command.runId,
        workspaceId: command.workspaceId,
        conversationId: command.conversationId,
        createdAt: command.now,
      })
      .onConflictDoNothing({ target: [conversationTitleRuns.runId] });
  };
