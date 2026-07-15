import type { AuthContext } from "#domain/auth-context";
import type { JsonValue } from "@side-chat/shared";

export type ToolApprovalInput = JsonValue;

export const TOOL_APPROVAL_STATES = {
  REQUESTED: "requested",
  APPROVED: "approved",
  DENIED: "denied",
  EXPIRED: "expired",
} as const;

export type ToolApprovalState = (typeof TOOL_APPROVAL_STATES)[keyof typeof TOOL_APPROVAL_STATES];

export const TOOL_APPROVAL_LOOKUP = {
  NOT_FOUND: "not_found",
  NOT_READY: "not_ready",
} as const;

export const TOOL_APPROVAL_DECISION_DISPOSITIONS = {
  ACCEPTED: "accepted",
  DUPLICATE: "duplicate",
  CONFLICT: "conflict",
  LATE: "late",
} as const;

export type ToolApprovalDecisionDisposition =
  (typeof TOOL_APPROVAL_DECISION_DISPOSITIONS)[keyof typeof TOOL_APPROVAL_DECISION_DISPOSITIONS];

export type ToolApprovalDecisionRef = Readonly<{
  workspaceId: string;
  subjectId: string;
  turnId: string;
  conversationId: string;
  runId: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  inputDigest: string;
}>;

export type ToolApprovalLookup =
  | ToolApprovalDecisionRef
  | (typeof TOOL_APPROVAL_LOOKUP)[keyof typeof TOOL_APPROVAL_LOOKUP];

export type ToolApprovalDecision = Readonly<{
  approved: boolean;
  requestId: string;
}>;

export type ToolApprovalDecisionResult = Readonly<{
  disposition: ToolApprovalDecisionDisposition;
  state: Exclude<ToolApprovalState, typeof TOOL_APPROVAL_STATES.REQUESTED>;
}>;

/** Authenticated route-side decision authority for durable tool approvals. */
export interface ToolApprovalDecisionStore {
  findOwnedApproval(
    auth: AuthContext,
    runId: string,
    approvalId: string,
  ): Promise<ToolApprovalLookup>;
  decideApproval(
    approval: ToolApprovalDecisionRef,
    decision: ToolApprovalDecision,
  ): Promise<ToolApprovalDecisionResult>;
}

export type ToolApprovalIdentity = Readonly<{
  workspaceId: string;
  subjectId: string;
  turnId: string;
  conversationId: string;
  runId: string;
  approvalId: string;
  toolCallId: string;
  toolName: string;
  inputDigest: string;
}>;

export type ToolApprovalRequest = ToolApprovalIdentity &
  Readonly<{
    requestedAt: string;
    expiresAt: string;
  }>;

export type ToolApprovalSnapshot = ToolApprovalRequest &
  Readonly<{
    state: ToolApprovalState;
    approved?: boolean | undefined;
  }>;

/** Durable workflow-step operations; hook payloads are never decision authority. */
export interface ToolApprovalWorkflowStore {
  createApproval(request: ToolApprovalRequest): Promise<ToolApprovalSnapshot>;
  readApproval(identity: ToolApprovalIdentity): Promise<ToolApprovalSnapshot | undefined>;
  expireApproval(identity: ToolApprovalIdentity): Promise<ToolApprovalSnapshot | undefined>;
}
