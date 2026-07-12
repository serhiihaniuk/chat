import type { ToolApprovalRecord } from "../entities.js";
import type {
  ActorId,
  AssistantTurnId,
  SubjectId,
  ToolApprovalId,
  ToolCallId,
} from "../ids/persistence-ids.js";
import type { RepositoryCommandEnvelope, RepositoryCommandResult } from "../repositories.js";

export const TOOL_APPROVAL_DECISIONS = {
  APPROVED: "approved",
  DENIED: "denied",
} as const;

export type ToolApprovalDecision =
  (typeof TOOL_APPROVAL_DECISIONS)[keyof typeof TOOL_APPROVAL_DECISIONS];

export const TOOL_APPROVAL_REPOSITORY_DISPOSITIONS = {
  ACCEPTED: "accepted",
  DUPLICATE: "duplicate",
  REJECTED: "rejected",
} as const;

export type ToolApprovalRepositoryDisposition =
  (typeof TOOL_APPROVAL_REPOSITORY_DISPOSITIONS)[keyof typeof TOOL_APPROVAL_REPOSITORY_DISPOSITIONS];

export const TOOL_APPROVAL_DECISION_REJECTIONS = {
  CONFLICTING_DECISION: "conflicting_decision",
  EXPIRED: "expired",
  IDENTITY_MISMATCH: "identity_mismatch",
  TURN_NOT_RUNNING: "turn_not_running",
} as const;

export type CreateOrGetToolApprovalCommand = RepositoryCommandEnvelope & {
  readonly assistantTurnId: AssistantTurnId;
  readonly approvalId: ToolApprovalId;
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly inputDigest: string;
  readonly expiresAt: string;
};

export type FindToolApprovalCommand = {
  readonly workspaceId: RepositoryCommandEnvelope["workspaceId"];
  readonly assistantTurnId: AssistantTurnId;
  readonly approvalId: ToolApprovalId;
};

export type DecideToolApprovalCommand = RepositoryCommandEnvelope &
  FindToolApprovalCommand & {
    readonly toolCallId: ToolCallId;
    readonly toolName: string;
    readonly inputDigest: string;
    readonly decision: ToolApprovalDecision;
    readonly reason?: string | undefined;
    readonly approverSubjectId: SubjectId;
    readonly approverActorId: ActorId;
  };

export type ExpireToolApprovalCommand = RepositoryCommandEnvelope &
  FindToolApprovalCommand & {
    readonly auditActorId: ActorId;
  };

export type ToolApprovalDecisionRejection =
  (typeof TOOL_APPROVAL_DECISION_REJECTIONS)[keyof typeof TOOL_APPROVAL_DECISION_REJECTIONS];

export type DecideToolApprovalResult = Readonly<{
  record: ToolApprovalRecord;
  disposition: ToolApprovalRepositoryDisposition;
  rejection?: ToolApprovalDecisionRejection | undefined;
}>;

export type ExpireToolApprovalResult = Readonly<{
  record: ToolApprovalRecord;
  claimed: boolean;
}>;

/** Atomic persistence operations for the durable gated-tool authorization lifecycle. */
export type ToolApprovalRepositoryContract = {
  readonly createOrGetToolApproval: (
    command: CreateOrGetToolApprovalCommand,
  ) => Promise<RepositoryCommandResult<ToolApprovalRecord>>;
  readonly findToolApproval: (
    command: FindToolApprovalCommand,
  ) => Promise<ToolApprovalRecord | undefined>;
  readonly decideToolApproval: (
    command: DecideToolApprovalCommand,
  ) => Promise<DecideToolApprovalResult | undefined>;
  readonly expireToolApproval: (
    command: ExpireToolApprovalCommand,
  ) => Promise<ExpireToolApprovalResult | undefined>;
};
