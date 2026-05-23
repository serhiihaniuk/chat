import type { JsonObject } from "@side-chat/chat-protocol";
import type {
  AssistantTurnStatus,
  ConversationStatus,
  HostCommandResultStatus,
  MessageRole,
  ToolInvocationStatus,
} from "./lifecycle.js";

export type TenantScopedRecord = {
  readonly tenantId: string;
  readonly workspaceId: string;
};

export type VersionedRecord = {
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ConversationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly conversationId: string;
    readonly status: ConversationStatus;
    readonly createdByUserId: string;
    readonly title?: string;
  };

export type MessageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly messageId: string;
    readonly conversationId: string;
    readonly role: MessageRole;
    readonly content: string;
    readonly sequence: number;
  };

export type AssistantTurnRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly assistantTurnId: string;
    readonly conversationId: string;
    readonly requestId: string;
    readonly status: AssistantTurnStatus;
    readonly modelId?: string;
    readonly terminalEventId?: string;
  };

export type ContextSnapshotRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly contextSnapshotId: string;
    readonly conversationId: string;
    readonly assistantTurnId: string;
    readonly hostOrigin?: string;
    readonly payload: JsonObject;
  };

export type UsageRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly usageRecordId: string;
    readonly assistantTurnId: string;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };

export type ToolInvocationRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly toolInvocationId: string;
    readonly assistantTurnId: string;
    readonly toolName: string;
    readonly status: ToolInvocationStatus;
    readonly requestPayload: JsonObject;
    readonly resultPayload?: JsonObject;
    readonly errorCode?: string;
  };

export type HostCommandResultRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly hostCommandResultId: string;
    readonly assistantTurnId: string;
    readonly commandName: string;
    readonly status: HostCommandResultStatus;
    readonly requestPayload: JsonObject;
    readonly resultPayload?: JsonObject;
  };

export type AuditEventRecord = TenantScopedRecord &
  VersionedRecord & {
    readonly auditEventId: string;
    readonly actorUserId: string;
    readonly action: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly metadata: JsonObject;
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
