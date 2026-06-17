import { brandNumber, brandString, type Brand } from "@side-chat/shared";

/**
 * Branded identifiers shared across the core-to-runtime contract.
 *
 * These are nominal string/number brands so a raw string cannot be passed where
 * a specific id is required. They live apart from the event and request
 * contracts so those files stay focused on shapes, not id plumbing.
 */

export type RequestId = Brand<string, "RequestId">;
export type AssistantTurnId = Brand<string, "AssistantTurnId">;
export type HostAppId = Brand<string, "HostAppId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type ConversationId = Brand<string, "ConversationId">;
export type ExecutorId = Brand<string, "ExecutorId">;
export type ProviderId = Brand<string, "ProviderId">;
export type ModelId = Brand<string, "ModelId">;
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
export const toRuntimeActivityId = (value: string): RuntimeActivityId =>
  brandString<"RuntimeActivityId">(value);
export const toToolCallId = (value: string): ToolCallId => brandString<"ToolCallId">(value);
export const toRuntimeSequence = (value: number): RuntimeSequence =>
  brandNumber<"RuntimeSequence">(value);
