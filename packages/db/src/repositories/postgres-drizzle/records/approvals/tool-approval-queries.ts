import { and, eq } from "drizzle-orm";

import { assistantTurns, toolApprovals } from "#drizzle/schema";
import type { ToolApprovalRecord } from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES } from "../../../errors.js";
import { one } from "../../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { toAssistantTurnRecord, toToolApprovalRecord } from "../records.js";

export type ApprovalDb = PostgresDrizzleRepositoryContext["db"];
export type ApprovalCommandIdentity = {
  readonly workspaceId: string;
  readonly assistantTurnId: string;
  readonly approvalId: string;
};

export const approvalIdentity = (command: ApprovalCommandIdentity) =>
  and(
    eq(toolApprovals.workspaceId, command.workspaceId),
    eq(toolApprovals.assistantTurnId, command.assistantTurnId),
    eq(toolApprovals.approvalId, command.approvalId),
  );

export const selectApprovalForUpdate = (db: ApprovalDb, command: ApprovalCommandIdentity) =>
  db
    .select()
    .from(toolApprovals)
    .where(approvalIdentity(command))
    .limit(1)
    .for("update")
    .then((rows) => rows[0]);

export const findByTurnCall = async (
  db: ApprovalDb,
  workspaceId: string,
  assistantTurnId: string,
  toolCallId: string,
): Promise<ToolApprovalRecord | undefined> => {
  const rows = await db
    .select()
    .from(toolApprovals)
    .where(
      and(
        eq(toolApprovals.workspaceId, workspaceId),
        eq(toolApprovals.assistantTurnId, assistantTurnId),
        eq(toolApprovals.toolCallId, toolCallId),
      ),
    )
    .limit(1);
  return rows[0] ? toToolApprovalRecord(rows[0]) : undefined;
};

export const requireTurn = async (db: ApprovalDb, workspaceId: string, assistantTurnId: string) => {
  const rows = await db
    .select()
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.workspaceId, workspaceId),
        eq(assistantTurns.assistantTurnId, assistantTurnId),
      ),
    )
    .limit(1);
  return toAssistantTurnRecord(
    one(
      rows,
      DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
      "Approval turn does not exist in the requested workspace.",
    ),
  );
};
