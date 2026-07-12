import { and, eq, lte } from "drizzle-orm";

import { toolApprovals } from "#drizzle/schema";
import {
  TOOL_APPROVAL_DECISION_REJECTIONS,
  TOOL_APPROVAL_REPOSITORY_DISPOSITIONS,
  type DecideToolApprovalCommand,
  type DecideToolApprovalResult,
  type ToolApprovalRecord,
} from "#schema-contract";
import type { SidechatRepositories } from "../../../contract.js";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../../errors.js";
import { one, result } from "../../../repository-utils.js";
import { approvalAudit, auditRejectedApprovalDecision, insertAuditEvent } from "./audit-events.js";
import {
  approvalIdentity,
  type ApprovalCommandIdentity,
  type ApprovalDb,
  findByTurnCall,
  requireTurn,
  selectApprovalForUpdate,
} from "./tool-approval-queries.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { toToolApprovalRecord } from "../records.js";

type ToolApprovalRepository = Pick<
  SidechatRepositories,
  "createOrGetToolApproval" | "decideToolApproval" | "expireToolApproval" | "findToolApproval"
>;

/** Durable approval state machine; every state change and its audit commit together. */
export const createPostgresDrizzleToolApprovalRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): ToolApprovalRepository => ({
  createOrGetToolApproval: (command) =>
    db.transaction(async (transaction) => {
      const turn = await requireTurn(transaction, command.workspaceId, command.assistantTurnId);
      const replay = await findByTurnCall(
        transaction,
        command.workspaceId,
        command.assistantTurnId,
        command.toolCallId,
      );
      if (replay) return result(requireSameRequest(replay, command), false);
      if (turn.status !== "running") {
        throw new DbRepositoryError(
          DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
          "A tool approval can be requested only while its turn is running.",
        );
      }
      const inserted = await transaction
        .insert(toolApprovals)
        .values({
          approvalId: command.approvalId,
          assistantTurnId: command.assistantTurnId,
          workspaceId: command.workspaceId,
          toolCallId: command.toolCallId,
          toolName: command.toolName,
          inputDigest: command.inputDigest,
          state: "requested",
          requestedAt: command.now,
          expiresAt: command.expiresAt,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted[0]) {
        const record = toToolApprovalRecord(inserted[0]);
        await insertAuditEvent(
          transaction,
          ids,
          approvalAudit(turn, record, "tool_approval_requested", turn.actorId, command.now),
        );
        return result(record, true);
      }

      const concurrent = await findByTurnCall(
        transaction,
        command.workspaceId,
        command.assistantTurnId,
        command.toolCallId,
      );
      if (!concurrent) {
        throw new DbRepositoryError(
          DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
          "Approval id is already bound to another tool call.",
        );
      }
      return result(requireSameRequest(concurrent, command), false);
    }),

  findToolApproval: async (command) => {
    const rows = await db.select().from(toolApprovals).where(approvalIdentity(command)).limit(1);
    return rows[0] ? toToolApprovalRecord(rows[0]) : undefined;
  },

  decideToolApproval: (command) =>
    db.transaction(async (transaction) => {
      const row = await selectApprovalForUpdate(transaction, command);
      if (!row) return undefined;
      const current = toToolApprovalRecord(row);
      const turn = await requireTurn(transaction, command.workspaceId, command.assistantTurnId);
      requireApproverOwnsTurn(turn.subjectId, command.approverSubjectId);

      if (!sameDecisionIdentity(current, command)) {
        await auditRejectedApprovalDecision(
          transaction,
          ids,
          turn,
          current,
          command,
          TOOL_APPROVAL_DECISION_REJECTIONS.IDENTITY_MISMATCH,
        );
        return rejected(current, TOOL_APPROVAL_DECISION_REJECTIONS.IDENTITY_MISMATCH);
      }
      if (sameTerminalDecision(current, command)) {
        return {
          record: current,
          disposition: TOOL_APPROVAL_REPOSITORY_DISPOSITIONS.DUPLICATE,
        };
      }
      if (current.state !== "requested") {
        const rejection =
          current.state === "expired"
            ? TOOL_APPROVAL_DECISION_REJECTIONS.EXPIRED
            : TOOL_APPROVAL_DECISION_REJECTIONS.CONFLICTING_DECISION;
        await auditRejectedApprovalDecision(transaction, ids, turn, current, command, rejection);
        return rejected(current, rejection);
      }
      if (turn.status !== "running") {
        await auditRejectedApprovalDecision(
          transaction,
          ids,
          turn,
          current,
          command,
          TOOL_APPROVAL_DECISION_REJECTIONS.TURN_NOT_RUNNING,
        );
        return rejected(current, TOOL_APPROVAL_DECISION_REJECTIONS.TURN_NOT_RUNNING);
      }
      if (new Date(command.now).getTime() >= new Date(current.expiresAt).getTime()) {
        const expired = await transitionToExpired(transaction, command, current);
        await insertAuditEvent(
          transaction,
          ids,
          approvalAudit(
            turn,
            expired,
            "tool_approval_expired",
            command.approverActorId,
            command.now,
          ),
        );
        await auditRejectedApprovalDecision(
          transaction,
          ids,
          turn,
          expired,
          command,
          TOOL_APPROVAL_DECISION_REJECTIONS.EXPIRED,
        );
        return rejected(expired, TOOL_APPROVAL_DECISION_REJECTIONS.EXPIRED);
      }

      const decided = await transaction
        .update(toolApprovals)
        .set({
          state: command.decision,
          decisionReason: command.reason,
          decidedBySubjectId: command.approverSubjectId,
          decidedByActorId: command.approverActorId,
          decidedAt: command.now,
        })
        .where(and(approvalIdentity(command), eq(toolApprovals.state, "requested")))
        .returning();
      const record = toToolApprovalRecord(
        requireUpdated(decided, "Approval decision lost its requested state."),
      );
      await insertAuditEvent(
        transaction,
        ids,
        approvalAudit(turn, record, "tool_approval_decided", command.approverActorId, command.now),
      );
      return { record, disposition: TOOL_APPROVAL_REPOSITORY_DISPOSITIONS.ACCEPTED };
    }),

  expireToolApproval: (command) =>
    db.transaction(async (transaction) => {
      const row = await selectApprovalForUpdate(transaction, command);
      if (!row) return undefined;
      const current = toToolApprovalRecord(row);
      if (current.state !== "requested" || new Date(command.now) < new Date(current.expiresAt)) {
        return { record: current, claimed: false };
      }
      const turn = await requireTurn(transaction, command.workspaceId, command.assistantTurnId);
      const expired = await transitionToExpired(transaction, command, current);
      await insertAuditEvent(
        transaction,
        ids,
        approvalAudit(turn, expired, "tool_approval_expired", command.auditActorId, command.now),
      );
      return { record: expired, claimed: true };
    }),
});

const sameRequest = (
  record: ToolApprovalRecord,
  command: {
    readonly approvalId: string;
    readonly toolName: string;
    readonly inputDigest: string;
    readonly expiresAt: string;
  },
) =>
  record.approvalId === command.approvalId &&
  record.toolName === command.toolName &&
  record.inputDigest === command.inputDigest &&
  record.expiresAt === new Date(command.expiresAt).toISOString();

const requireSameRequest = (
  record: ToolApprovalRecord,
  command: Parameters<typeof sameRequest>[1],
): ToolApprovalRecord => {
  if (sameRequest(record, command)) return record;
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
    "A replayed approval request cannot change approval identity, tool input, or expiry.",
  );
};

const sameDecisionIdentity = (record: ToolApprovalRecord, command: DecideToolApprovalCommand) =>
  record.toolCallId === command.toolCallId &&
  record.toolName === command.toolName &&
  record.inputDigest === command.inputDigest;

const sameTerminalDecision = (record: ToolApprovalRecord, command: DecideToolApprovalCommand) =>
  record.state === command.decision && record.decisionReason === command.reason;

const requireApproverOwnsTurn = (ownerSubjectId: string, approverSubjectId: string) => {
  if (ownerSubjectId === approverSubjectId) return;
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.CROSS_TENANT_ACCESS_DENIED,
    "Tool approval belongs to a different subject.",
  );
};

const rejected = (
  record: ToolApprovalRecord,
  rejection: NonNullable<DecideToolApprovalResult["rejection"]>,
): DecideToolApprovalResult => ({
  record,
  disposition: TOOL_APPROVAL_REPOSITORY_DISPOSITIONS.REJECTED,
  rejection,
});

const transitionToExpired = async (
  db: ApprovalDb,
  command: ApprovalCommandIdentity & { readonly now: string },
  current: ToolApprovalRecord,
) => {
  const rows = await db
    .update(toolApprovals)
    .set({ state: "expired", decidedAt: command.now })
    .where(
      and(
        approvalIdentity(command),
        eq(toolApprovals.state, "requested"),
        lte(toolApprovals.expiresAt, command.now),
      ),
    )
    .returning();
  return toToolApprovalRecord(
    requireUpdated(rows, `Approval ${current.approvalId} was not expirable.`),
  );
};

const requireUpdated = <Row>(rows: readonly Row[], message: string): Row =>
  one(rows, DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION, message);
