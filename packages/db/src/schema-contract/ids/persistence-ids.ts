import { brandString, type Brand } from "@side-chat/shared";

export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type ActorId = Brand<string, "SubjectId">;
export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type UserMessageId = Brand<string, "MessageId">;
export type AssistantMessageId = Brand<string, "MessageId">;
export type AssistantTurnId = Brand<string, "AssistantTurnId">;
export type RequestId = Brand<string, "RequestId">;
export type ContextSnapshotId = Brand<string, "ContextSnapshotId">;
export type UsageRecordId = Brand<string, "UsageRecordId">;
export type ToolInvocationId = Brand<string, "ToolInvocationId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type HostCommandResultId = Brand<string, "HostCommandResultId">;
export type HostCommandId = Brand<string, "HostCommandId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type ModelId = Brand<string, "ModelId">;
export type ProviderRequestId = Brand<string, "ProviderRequestId">;
export type HostSurfaceId = Brand<string, "HostSurfaceId">;
export type ResourceId = Brand<string, "ResourceId">;
export type TargetId = Brand<string, "TargetId">;

export const toWorkspaceId = (value: string): WorkspaceId => brandString<"WorkspaceId">(value);
export const toSubjectId = (value: string): SubjectId => brandString<"SubjectId">(value);
export const toActorId = (value: string): ActorId => brandString<"SubjectId">(value);
export const toConversationId = (value: string): ConversationId =>
  brandString<"ConversationId">(value);
export const toMessageId = (value: string): MessageId => brandString<"MessageId">(value);
export const toUserMessageId = (value: string): UserMessageId => brandString<"MessageId">(value);
export const toAssistantMessageId = (value: string): AssistantMessageId =>
  brandString<"MessageId">(value);
export const toAssistantTurnId = (value: string): AssistantTurnId =>
  brandString<"AssistantTurnId">(value);
export const toRequestId = (value: string): RequestId => brandString<"RequestId">(value);
export const toContextSnapshotId = (value: string): ContextSnapshotId =>
  brandString<"ContextSnapshotId">(value);
export const toUsageRecordId = (value: string): UsageRecordId =>
  brandString<"UsageRecordId">(value);
export const toToolInvocationId = (value: string): ToolInvocationId =>
  brandString<"ToolInvocationId">(value);
export const toToolCallId = (value: string): ToolCallId => brandString<"ToolCallId">(value);
export const toHostCommandResultId = (value: string): HostCommandResultId =>
  brandString<"HostCommandResultId">(value);
export const toHostCommandId = (value: string): HostCommandId =>
  brandString<"HostCommandId">(value);
export const toAuditEventId = (value: string): AuditEventId => brandString<"AuditEventId">(value);
export const toModelId = (value: string): ModelId => brandString<"ModelId">(value);
export const toProviderRequestId = (value: string): ProviderRequestId =>
  brandString<"ProviderRequestId">(value);
export const toHostSurfaceId = (value: string): HostSurfaceId =>
  brandString<"HostSurfaceId">(value);
export const toResourceId = (value: string): ResourceId => brandString<"ResourceId">(value);
export const toTargetId = (value: string): TargetId => brandString<"TargetId">(value);
