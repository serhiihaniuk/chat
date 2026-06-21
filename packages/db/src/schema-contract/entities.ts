import type { JsonObject } from "@side-chat/shared";
import type {
  ActorId,
  AssistantMessageId,
  AssistantTurnId,
  AuditEventId,
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
  ToolInvocationId,
  UsageRecordId,
  UserMessageId,
  WorkspaceId,
} from "./ids/persistence-ids.js";
import type {
  AssistantTurnStatus,
  ConversationStatus,
  HostCommandResultStatus,
  MessageRole,
  ToolInvocationStatus,
  TurnEventType,
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
    readonly lastMessageAt: string;
  };

export type ConversationSummaryRecord = ConversationRecord;

export type MessageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly messageId: MessageId;
    readonly conversationId: ConversationId;
    readonly role: MessageRole;
    readonly contentText: string;
    readonly metadataJson: JsonObject;
    readonly sequenceIndex: number;
    readonly idempotencyKey?: string;
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
    readonly runtimeProfile: string;
    readonly systemPromptVersion: string;
    readonly contextStrategyVersion: string;
    readonly toolRegistryVersion: string;
    readonly modelProvider: string;
    readonly modelId: ModelId;
    readonly status: AssistantTurnStatus;
    readonly finishReason?: string;
    readonly errorCode?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
  };

/**
 * One immutable row in a turn's durable event log.
 *
 * Unlike the other records this is append-only and not workspace-stamped: the
 * row is scoped transitively through its `assistantTurnId`, and `payloadJson`
 * holds the browser-facing stream event verbatim. There is no `updatedAt`
 * because events are never mutated after they are written.
 */
export type TurnEventRecord = {
  readonly assistantTurnId: AssistantTurnId;
  readonly sequence: number;
  readonly type: TurnEventType;
  readonly payloadJson: JsonObject;
  readonly createdAt: string;
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
  | HostCommandResultRecord
  | AuditEventRecord;
