import type { JsonObject } from "@side-chat/shared";
import type {
  ActorId,
  AssistantMessageId,
  AssistantTurnId,
  AuditEventId,
  ClientToolDispatchId,
  ContextSnapshotId,
  ConversationId,
  HostCommandId,
  HostCommandResultId,
  HostSurfaceId,
  MessageId,
  ModelId,
  ProviderRequestId,
  RequestId,
  ResourceId,
  SubjectId,
  TargetId,
  ToolCallId,
  ToolApprovalId,
  ToolInvocationId,
  UsageRecordId,
  UserMessageId,
  WorkspaceId,
} from "./ids/persistence-ids.js";
import type {
  AssistantTurnStatus,
  ClientToolDispatchState,
  ConversationStatus,
  HostCommandResultStatus,
  MessageRole,
  ToolInvocationStatus,
  ToolApprovalState,
} from "./lifecycle.js";

export type TenantScopedRecord = {
  readonly workspaceId: WorkspaceId;
};

export type VersionedRecord = {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ConversationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly conversationId: ConversationId;
    readonly subjectId: SubjectId;
    readonly conversationKey: string;
    readonly status: ConversationStatus;
    readonly titleText?: string;
    readonly createdByActorId: ActorId;
    readonly historyCutoffSequenceIndex?: number;
    /** When true, every prune/delete path must skip this conversation. */
    readonly legalHold: boolean;
    readonly lastMessageAt: string;
  };

export type ConversationSummaryRecord = ConversationRecord;

export type MessageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly messageId: MessageId;
    readonly conversationId: ConversationId;
    readonly role: MessageRole;
    /** The AI SDK `UIMessage.parts` verbatim — the one durable message body. */
    readonly parts: readonly JsonObject[];
    readonly metadataJson: JsonObject;
    readonly sequenceIndex: number;
  };

export type AssistantTurnRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly assistantTurnId: AssistantTurnId;
    readonly requestId: RequestId;
    readonly conversationId: ConversationId;
    readonly subjectId: SubjectId;
    readonly actorId: ActorId;
    readonly userMessageId: UserMessageId;
    readonly assistantMessageId?: AssistantMessageId;
    /** The durable Workflow run this turn attaches to; set once, after start. */
    readonly runId?: string;
    /** When the route or Workflow claim first bound `runId`. */
    readonly runBoundAt?: string;
    /** Durable user intent, written before cancellation delivery is attempted. */
    readonly cancelRequestedAt?: string;
    // Provenance for a regulated deployment: exactly which model, prompt, config,
    // and content-filter version produced this turn.
    readonly modelProvider: string;
    readonly modelId: ModelId;
    readonly instructionsVersion: string;
    readonly configVersion: string;
    readonly contentFilterVersion: string;
    readonly status: AssistantTurnStatus;
    readonly finishReason?: string;
    readonly errorCode?: string;
    // Aggregate usage folded onto the turn; zero until a terminal status.
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly reasoningTokens: number;
    readonly cachedInputTokens: number;
    readonly startedAt: string;
    readonly completedAt?: string;
  };

export type ContextSnapshotRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly contextSnapshotId: ContextSnapshotId;
    readonly assistantTurnId: AssistantTurnId;
    readonly contextSchemaVersion: string;
    readonly hostSurfaceId?: HostSurfaceId;
    readonly hostContextHash: string;
    readonly capabilitiesHash: string;
    readonly contextRedactedJson: JsonObject;
  };

export type UsageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly usageRecordId: UsageRecordId;
    readonly assistantTurnId: AssistantTurnId;
    readonly runtimeStepIndex: number;
    readonly modelProvider: string;
    readonly modelId: ModelId;
    readonly providerRequestId?: ProviderRequestId;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly cachedInputTokens: number;
    readonly totalTokens: number;
    readonly costUnits: string;
  };

export type ToolInvocationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly toolInvocationId: ToolInvocationId;
    readonly assistantTurnId: AssistantTurnId;
    readonly runtimeStepIndex: number;
    readonly toolCallId: ToolCallId;
    readonly toolName: string;
    readonly status: ToolInvocationStatus;
    readonly inputHash: string;
    readonly outputHash?: string;
    readonly inputRedactedJson: JsonObject;
    readonly outputRedactedJson?: JsonObject;
    readonly errorCode?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
  };

/**
 * Coordination row for one browser-executed tool call.
 *
 * `outputJson` is the exact typed value returned to the model. A late browser
 * result never replaces it; `lateResultAt` records only that the result arrived
 * after the timeout outcome had already won.
 */
export type ClientToolDispatchRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly clientToolDispatchId: ClientToolDispatchId;
    readonly assistantTurnId: AssistantTurnId;
    readonly toolCallId: ToolCallId;
    readonly toolName: string;
    readonly state: ClientToolDispatchState;
    readonly outputJson?: JsonObject;
    readonly dispatchedAt: string;
    readonly completedAt?: string;
    readonly lateResultAt?: string;
  };

/** Durable authorization decision for one exact tool call and input digest. */
export type ToolApprovalRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly approvalId: ToolApprovalId;
    readonly assistantTurnId: AssistantTurnId;
    readonly toolCallId: ToolCallId;
    readonly toolName: string;
    readonly inputDigest: string;
    readonly state: ToolApprovalState;
    readonly decidedBySubjectId?: SubjectId;
    readonly decidedByActorId?: ActorId;
    readonly requestedAt: string;
    readonly decidedAt?: string;
    readonly expiresAt: string;
  };

export type HostCommandResultRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly hostCommandId: HostCommandResultId;
    readonly assistantTurnId: AssistantTurnId;
    readonly commandId: HostCommandId;
    readonly commandType: string;
    readonly resourceId?: ResourceId;
    readonly status: HostCommandResultStatus;
    readonly resultCode: string;
    readonly commandRedactedJson: JsonObject;
    readonly resultRedactedJson?: JsonObject;
    readonly resolvedAt?: string;
  };

export type AuditEventRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly auditEventId: AuditEventId;
    readonly subjectId: SubjectId;
    readonly actorId: ActorId;
    readonly eventType: string;
    readonly targetType: string;
    readonly targetId: TargetId;
    readonly metadataJson: JsonObject;
    readonly requestId: RequestId;
  };

export type SchemaContractRecord =
  | ConversationRecord
  | MessageRecord
  | AssistantTurnRecord
  | ContextSnapshotRecord
  | UsageRecord
  | ToolInvocationRecord
  | ClientToolDispatchRecord
  | ToolApprovalRecord
  | HostCommandResultRecord
  | AuditEventRecord;
