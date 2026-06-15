import { brandNumber, brandString, type Brand } from "@side-chat/shared";

export type RequestId = Brand<string, "RequestId">;
export type AssistantTurnId = Brand<string, "AssistantTurnId">;
export type HostAppId = Brand<string, "HostAppId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type ConversationId = Brand<string, "ConversationId">;
export type ExecutorId = Brand<string, "ExecutorId">;
export type ProviderId = Brand<string, "ProviderId">;
export type ModelId = Brand<string, "ModelId">;
export type ProfileId = Brand<string, "ProfileId">;
export type RuntimeActivityId = Brand<string, "RuntimeActivityId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type RuntimeSequence = Brand<number, "RuntimeSequence">;

export const toRequestId = (value: string): RequestId => brandString<"RequestId">(value);
export const toAssistantTurnId = (value: string): AssistantTurnId =>
  brandString<"AssistantTurnId">(value);
export const toHostAppId = (value: string): HostAppId => brandString<"HostAppId">(value);
export const toWorkspaceId = (value: string): WorkspaceId => brandString<"WorkspaceId">(value);
export const toSubjectId = (value: string): SubjectId => brandString<"SubjectId">(value);
export const toConversationId = (value: string): ConversationId =>
  brandString<"ConversationId">(value);
export const toExecutorId = (value: string): ExecutorId => brandString<"ExecutorId">(value);
export const toProviderId = (value: string): ProviderId => brandString<"ProviderId">(value);
export const toModelId = (value: string): ModelId => brandString<"ModelId">(value);
export const toProfileId = (value: string): ProfileId => brandString<"ProfileId">(value);
export const toRuntimeActivityId = (value: string): RuntimeActivityId =>
  brandString<"RuntimeActivityId">(value);
export const toToolCallId = (value: string): ToolCallId => brandString<"ToolCallId">(value);
export const toRuntimeSequence = (value: number): RuntimeSequence =>
  brandNumber<"RuntimeSequence">(value);
