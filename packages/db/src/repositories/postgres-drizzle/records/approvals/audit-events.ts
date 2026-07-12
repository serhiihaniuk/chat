import { auditEvents } from "#drizzle/schema";
import {
  toTargetId,
  type AppendAuditEventCommand,
  type AssistantTurnRecord,
  type DecideToolApprovalCommand,
  type DecideToolApprovalResult,
  type ToolApprovalRecord,
} from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES } from "../../../errors.js";
import { one, result } from "../../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { toAuditEventRecord } from "../records.js";

type AuditInsertDb = Pick<PostgresDrizzleRepositoryContext["db"], "insert">;
type AuditIds = PostgresDrizzleRepositoryContext["ids"];
const APPROVAL_AUDIT_TARGET = "tool_approval";

/** Insert one content-bounded audit event through either the pool or a transaction. */
export async function insertAuditEvent(
  db: AuditInsertDb,
  ids: AuditIds,
  command: AppendAuditEventCommand,
) {
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
      one(rows, DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND, "Audit event insert returned no row."),
    ),
    true,
  );
}

export function auditRejectedApprovalDecision(
  db: AuditInsertDb,
  ids: AuditIds,
  turn: AssistantTurnRecord,
  approval: ToolApprovalRecord,
  command: DecideToolApprovalCommand,
  rejection: NonNullable<DecideToolApprovalResult["rejection"]>,
) {
  return insertAuditEvent(db, ids, {
    ...approvalAudit(
      turn,
      approval,
      "tool_approval_decision_rejected",
      command.approverActorId,
      command.now,
    ),
    metadataJson: {
      ...approvalMetadata(turn, approval),
      attemptedDecision: command.decision,
      attemptedToolCallId: command.toolCallId,
      attemptedToolName: command.toolName,
      attemptedInputDigest: command.inputDigest,
      rejection,
      reason: command.reason ?? null,
    },
  });
}

export function approvalAudit(
  turn: AssistantTurnRecord,
  approval: ToolApprovalRecord,
  eventType: string,
  actorId: string,
  now: string,
): AppendAuditEventCommand {
  return {
    workspaceId: approval.workspaceId,
    subjectId: turn.subjectId,
    actorId,
    eventType,
    targetType: APPROVAL_AUDIT_TARGET,
    targetId: toTargetId(approval.approvalId),
    requestId: turn.requestId,
    metadataJson: approvalMetadata(turn, approval),
    now,
  };
}

function approvalMetadata(turn: AssistantTurnRecord, approval: ToolApprovalRecord) {
  return {
    conversationId: turn.conversationId,
    turnId: turn.assistantTurnId,
    runId: turn.runId ?? null,
    approvalId: approval.approvalId,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    inputDigest: approval.inputDigest,
    decision: approval.state,
    reason: approval.decisionReason ?? null,
    requestedAt: approval.requestedAt,
    decidedAt: approval.decidedAt ?? null,
    expiresAt: approval.expiresAt,
  };
}
