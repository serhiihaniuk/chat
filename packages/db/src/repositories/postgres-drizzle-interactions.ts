import { and, eq } from "drizzle-orm";

import {
  auditEvents,
  hostCommandResults,
  toolInvocations,
} from "#drizzle/schema";
import type { SidechatRepositories } from "./contract.js";
import type { PostgresDrizzleRepositoryContext } from "./postgres-drizzle-context.js";
import {
  one,
  optional,
  toAuditEventRecord,
  toHostCommandResultRecord,
  toToolInvocationRecord,
} from "./postgres-drizzle-records.js";
import { result } from "./repository-utils.js";

export const createPostgresDrizzleInteractionRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  "appendAuditEvent" | "recordHostCommandResult" | "recordToolInvocation"
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
        toolInvocationId:
          existing[0]?.toolInvocationId ?? ids.next("tool_invocation"),
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
          "record_not_found",
          "Tool invocation upsert returned no row.",
        ),
      ),
      existing.length === 0,
    );
  },
  recordHostCommandResult: async (command) => {
    const existing = await db
      .select()
      .from(hostCommandResults)
      .where(
        and(
          eq(hostCommandResults.workspaceId, command.workspaceId),
          eq(hostCommandResults.assistantTurnId, command.assistantTurnId),
          eq(hostCommandResults.commandId, command.commandId),
        ),
      )
      .limit(1);
    const rows = await db
      .insert(hostCommandResults)
      .values({
        hostCommandId: existing[0]?.hostCommandId ?? ids.next("host_command"),
        assistantTurnId: command.assistantTurnId,
        workspaceId: command.workspaceId,
        commandId: command.commandId,
        commandType: command.commandType,
        resourceId: optional(command.resourceId),
        status: command.status,
        resultCode: command.resultCode,
        commandRedactedJson: command.commandRedactedJson,
        resultRedactedJson: optional(command.resultRedactedJson),
        createdAt: command.now,
        resolvedAt: optional(command.resolvedAt),
      })
      .onConflictDoUpdate({
        target: [
          hostCommandResults.assistantTurnId,
          hostCommandResults.commandId,
        ],
        set: {
          commandType: command.commandType,
          resourceId: optional(command.resourceId),
          status: command.status,
          resultCode: command.resultCode,
          commandRedactedJson: command.commandRedactedJson,
          resultRedactedJson: optional(command.resultRedactedJson),
          resolvedAt: optional(command.resolvedAt),
        },
      })
      .returning();
    return result(
      toHostCommandResultRecord(
        one(
          rows,
          "record_not_found",
          "Host command result upsert returned no row.",
        ),
      ),
      existing.length === 0,
    );
  },
  appendAuditEvent: async (command) => {
    const rows = await db
      .insert(auditEvents)
      .values({
        auditEventId: ids.next("audit_event"),
        workspaceId: command.workspaceId,
        subjectId: command.subjectId,
        actorId: command.actorId,
        eventType: command.eventType,
        targetType: command.targetType,
        targetId: command.targetId,
        metadataJson: command.metadataJson,
        requestId: command.requestId,
        createdAt: command.now,
      })
      .returning();
    return result(
      toAuditEventRecord(
        one(rows, "record_not_found", "Audit event insert returned no row."),
      ),
      true,
    );
  },
});
