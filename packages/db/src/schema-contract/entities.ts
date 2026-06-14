import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantTurnStatus,
  ConversationStatus,
  HostCommandResultStatus,
  MessageRole,
  ToolInvocationStatus,
} from "./lifecycle.js";

export type TenantScopedRecord = {
  readonly workspaceId: string;
};

export type VersionedRecord = {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ConversationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly conversationId: string;
    readonly subjectId: string;
    readonly conversationKey: string;
    readonly status: ConversationStatus;
    readonly createdByActorId: string;
    readonly lastMessageAt: string;
  };

export type MessageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly messageId: string;
    readonly conversationId: string;
    readonly role: MessageRole;
    readonly contentText: string;
    readonly metadataJson: JsonObject;
    readonly sequenceIndex: number;
    readonly idempotencyKey?: string;
  };

export type AssistantTurnRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly assistantTurnId: string;
    readonly requestId: string;
    readonly conversationId: string;
    readonly subjectId: string;
    readonly actorId: string;
    readonly userMessageId: string;
    readonly assistantMessageId?: string;
    readonly runtimeProfile: string;
    readonly systemPromptVersion: string;
    readonly contextStrategyVersion: string;
    readonly toolRegistryVersion: string;
    readonly modelProvider: string;
    readonly modelId: string;
    readonly status: AssistantTurnStatus;
    readonly finishReason?: string;
    readonly errorCode?: string;
    readonly startedAt: string;
    readonly completedAt?: string;
  };

export type ContextSnapshotRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly contextSnapshotId: string;
    readonly assistantTurnId: string;
    readonly contextSchemaVersion: string;
    readonly hostSurfaceId?: string;
    readonly hostContextHash: string;
    readonly capabilitiesHash: string;
    readonly contextRedactedJson: JsonObject;
  };

export type UsageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly usageRecordId: string;
    readonly assistantTurnId: string;
    readonly runtimeStepIndex: number;
    readonly modelProvider: string;
    readonly modelId: string;
    readonly providerRequestId?: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly cachedInputTokens: number;
    readonly totalTokens: number;
    readonly costUnits: string;
  };

export type ToolInvocationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly toolInvocationId: string;
    readonly assistantTurnId: string;
    readonly runtimeStepIndex: number;
    readonly toolCallId: string;
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
    readonly hostCommandId: string;
    readonly assistantTurnId: string;
    readonly commandId: string;
    readonly commandType: string;
    readonly resourceId?: string;
    readonly status: HostCommandResultStatus;
    readonly resultCode: string;
    readonly commandRedactedJson: JsonObject;
    readonly resultRedactedJson?: JsonObject;
    readonly resolvedAt?: string;
  };

export type AuditEventRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly auditEventId: string;
    readonly subjectId: string;
    readonly actorId: string;
    readonly eventType: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly metadataJson: JsonObject;
    readonly requestId: string;
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
