import { and, eq } from "drizzle-orm";

import { toolInvocations } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import { toToolInvocationRecord } from "./records.js";
import { insertAuditEvent } from "./approvals/audit-events.js";
import { DB_REPOSITORY_ERROR_CODES } from "../../errors.js";
import { one, optional, result } from "../../repository-utils.js";

export const createPostgresDrizzleInteractionRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  "appendAuditEvent" | "recordToolInvocation"
> => ({
  recordToolInvocation: async (command) => {
    const existing = await db
      .select()
      .from(toolInvocations)
      .where(
        and(
          eq(toolInvocations.workspaceId, command.workspaceId),
          eq(toolInvocations.assistantTurnId, command.assistantTurnId),
          eq(toolInvocations.toolCallId, command.toolCallId),
        ),
      )
      .limit(1);
    const rows = await db
      .insert(toolInvocations)
      .values({
        toolInvocationId: existing[0]?.toolInvocationId ?? ids.next("tool_invocation"),
        assistantTurnId: command.assistantTurnId,
        workspaceId: command.workspaceId,
        runtimeStepIndex: command.runtimeStepIndex,
        toolCallId: command.toolCallId,
        toolName: command.toolName,
        status: command.status,
        inputHash: command.inputHash,
        outputHash: optional(command.outputHash),
        inputRedactedJson: command.inputRedactedJson,
        outputRedactedJson: optional(command.outputRedactedJson),
        errorCode: optional(command.errorCode),
        startedAt: command.startedAt,
        completedAt: optional(command.completedAt),
      })
      .onConflictDoUpdate({
        target: [toolInvocations.assistantTurnId, toolInvocations.toolCallId],
        set: {
          runtimeStepIndex: command.runtimeStepIndex,
          toolName: command.toolName,
          status: command.status,
          inputHash: command.inputHash,
          outputHash: optional(command.outputHash),
          inputRedactedJson: command.inputRedactedJson,
          outputRedactedJson: optional(command.outputRedactedJson),
          errorCode: optional(command.errorCode),
          startedAt: command.startedAt,
          completedAt: optional(command.completedAt),
        },
      })
      .returning();
    return result(
      toToolInvocationRecord(
        one(
          rows,
          DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
          "Tool invocation upsert returned no row.",
        ),
      ),
      existing.length === 0,
    );
  },
  appendAuditEvent: (command) => insertAuditEvent(db, ids, command),
});
