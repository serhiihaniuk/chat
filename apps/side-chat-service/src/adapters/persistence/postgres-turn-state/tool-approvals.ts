import {
  TOOL_APPROVAL_DECISIONS,
  TOOL_APPROVAL_DECISION_REJECTIONS,
  TOOL_APPROVAL_REPOSITORY_DISPOSITIONS,
  toActorId,
  toAssistantTurnId,
  toSubjectId,
  toToolApprovalId,
  toToolCallId,
  toWorkspaceId,
  type AssistantTurnRecord,
  type ToolApprovalRecord,
} from "@side-chat/db";

import {
  TOOL_APPROVAL_DECISION_DISPOSITIONS,
  TOOL_APPROVAL_LOOKUP,
  TOOL_APPROVAL_STATES,
  type ToolApprovalDecisionStore,
  type ToolApprovalIdentity,
  type ToolApprovalSnapshot,
  type ToolApprovalWorkflowStore,
} from "#application/ports/turn/tools/tool-approval-store";

import type { ClosableRepositories } from "./types.js";

/** Map authenticated decisions and Workflow-step lifecycle operations onto PostgreSQL. */
export function createPostgresToolApprovalStore(
  repositories: ClosableRepositories,
): ToolApprovalDecisionStore & ToolApprovalWorkflowStore {
  return {
    async findOwnedApproval(auth, runId, approvalId) {
      const turn = await repositories.findAssistantTurnByRun({
        workspaceId: toWorkspaceId(auth.workspaceId),
        subjectId: toSubjectId(auth.subjectId),
        runId,
      });
      if (turn === undefined) return TOOL_APPROVAL_LOOKUP.NOT_FOUND;
      const approval = await repositories.findToolApproval({
        workspaceId: turn.workspaceId,
        assistantTurnId: turn.assistantTurnId,
        approvalId: toToolApprovalId(approvalId),
      });
      if (approval === undefined) return TOOL_APPROVAL_LOOKUP.NOT_READY;
      return toDecisionRef(turn, approval);
    },

    async decideApproval(approval, decision) {
      const result = await repositories.decideToolApproval({
        ...toRepositoryIdentity(approval),
        toolCallId: toToolCallId(approval.toolCallId),
        toolName: approval.toolName,
        inputDigest: approval.inputDigest,
        decision: decision.approved
          ? TOOL_APPROVAL_DECISIONS.APPROVED
          : TOOL_APPROVAL_DECISIONS.DENIED,
        ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        approverSubjectId: toSubjectId(approval.subjectId),
        approverActorId: toActorId(approval.subjectId),
        now: new Date().toISOString(),
      });
      if (result === undefined) throw new Error("Tool approval disappeared during decision");
      if (result.disposition === TOOL_APPROVAL_REPOSITORY_DISPOSITIONS.ACCEPTED) {
        return {
          disposition: TOOL_APPROVAL_DECISION_DISPOSITIONS.ACCEPTED,
          state: terminalState(result.record),
        };
      }
      if (result.disposition === TOOL_APPROVAL_REPOSITORY_DISPOSITIONS.DUPLICATE) {
        return {
          disposition: TOOL_APPROVAL_DECISION_DISPOSITIONS.DUPLICATE,
          state: terminalState(result.record),
        };
      }
      return {
        disposition:
          result.rejection === TOOL_APPROVAL_DECISION_REJECTIONS.EXPIRED ||
          result.rejection === TOOL_APPROVAL_DECISION_REJECTIONS.TURN_NOT_RUNNING
            ? TOOL_APPROVAL_DECISION_DISPOSITIONS.LATE
            : TOOL_APPROVAL_DECISION_DISPOSITIONS.CONFLICT,
        state: terminalState(result.record),
      };
    },

    async createApproval(request) {
      const turn = await requireMatchingTurn(repositories, request);
      const result = await repositories.createOrGetToolApproval({
        ...toRepositoryIdentity(request),
        toolCallId: toToolCallId(request.toolCallId),
        toolName: request.toolName,
        inputDigest: request.inputDigest,
        expiresAt: request.expiresAt,
        now: request.requestedAt,
      });
      return toSnapshot(turn, result.record);
    },

    async readApproval(identity) {
      const turn = await requireMatchingTurn(repositories, identity);
      const record = await repositories.findToolApproval({
        ...toRepositoryIdentity(identity),
      });
      return record === undefined
        ? undefined
        : toSnapshot(turn, requireMatchingApproval(record, identity));
    },

    async expireApproval(identity) {
      const turn = await requireMatchingTurn(repositories, identity);
      const current = await repositories.findToolApproval(toRepositoryIdentity(identity));
      if (current === undefined) return undefined;
      requireMatchingApproval(current, identity);
      const result = await repositories.expireToolApproval({
        ...toRepositoryIdentity(identity),
        auditActorId: turn.actorId,
        now: new Date().toISOString(),
      });
      return result === undefined ? undefined : toSnapshot(turn, result.record);
    },
  };
}

function requireMatchingApproval(
  record: ToolApprovalRecord,
  identity: ToolApprovalIdentity,
): ToolApprovalRecord {
  if (
    record.toolCallId !== identity.toolCallId ||
    record.toolName !== identity.toolName ||
    record.inputDigest !== identity.inputDigest
  ) {
    throw new Error("Tool approval no longer matches its tool call identity");
  }
  return record;
}

function toRepositoryIdentity(identity: {
  readonly workspaceId: string;
  readonly turnId: string;
  readonly approvalId: string;
}) {
  return {
    workspaceId: toWorkspaceId(identity.workspaceId),
    assistantTurnId: toAssistantTurnId(identity.turnId),
    approvalId: toToolApprovalId(identity.approvalId),
  };
}

async function requireMatchingTurn(
  repositories: ClosableRepositories,
  identity: ToolApprovalIdentity,
): Promise<AssistantTurnRecord> {
  const turn = await repositories.findAssistantTurnByRun({
    workspaceId: toWorkspaceId(identity.workspaceId),
    subjectId: toSubjectId(identity.subjectId),
    runId: identity.runId,
  });
  if (
    turn === undefined ||
    turn.assistantTurnId !== identity.turnId ||
    turn.conversationId !== identity.conversationId
  ) {
    throw new Error("Tool approval identity does not match its durable turn");
  }
  return turn;
}

function toDecisionRef(turn: AssistantTurnRecord, approval: ToolApprovalRecord) {
  return {
    workspaceId: turn.workspaceId,
    subjectId: turn.subjectId,
    turnId: turn.assistantTurnId,
    conversationId: turn.conversationId,
    runId: requireRunId(turn),
    approvalId: approval.approvalId,
    toolCallId: approval.toolCallId,
    toolName: approval.toolName,
    inputDigest: approval.inputDigest,
  };
}

function toSnapshot(turn: AssistantTurnRecord, approval: ToolApprovalRecord): ToolApprovalSnapshot {
  return {
    ...toDecisionRef(turn, approval),
    requestedAt: approval.requestedAt,
    expiresAt: approval.expiresAt,
    state: approval.state,
    approved: approvalBoolean(approval),
    reason: approval.decisionReason,
  };
}

function approvalBoolean(approval: ToolApprovalRecord): boolean | undefined {
  if (approval.state === TOOL_APPROVAL_STATES.APPROVED) return true;
  if (approval.state === TOOL_APPROVAL_STATES.DENIED) return false;
  return undefined;
}

function requireRunId(turn: AssistantTurnRecord): string {
  if (turn.runId === undefined) throw new Error("Approval turn is not bound to a Workflow run");
  return turn.runId;
}

function terminalState(
  record: ToolApprovalRecord,
): Exclude<ToolApprovalSnapshot["state"], typeof TOOL_APPROVAL_STATES.REQUESTED> {
  if (record.state === TOOL_APPROVAL_STATES.REQUESTED) {
    throw new Error("Rejected approval decision unexpectedly remained requested");
  }
  return record.state;
}
