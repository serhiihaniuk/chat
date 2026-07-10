import { brandString, type Brand } from "@side-chat/shared";

export type HostAppId = Brand<string, "HostAppId">;
export type ProviderId = Brand<string, "ProviderId">;
export type ModelId = Brand<string, "ModelId">;
export type ProfileId = Brand<string, "ProfileId">;
export type SystemPromptId = Brand<string, "SystemPromptId">;
export type ExecutorId = Brand<string, "ExecutorId">;
export type PolicyId = Brand<string, "PolicyId">;
export type ManifestHash = Brand<string, "ManifestHash">;

export const toHostAppId = (value: string): HostAppId => brandString<"HostAppId">(value);
export const toProviderId = (value: string): ProviderId => brandString<"ProviderId">(value);
export const toModelId = (value: string): ModelId => brandString<"ModelId">(value);
export const toProfileId = (value: string): ProfileId => brandString<"ProfileId">(value);
export const toSystemPromptId = (value: string): SystemPromptId =>
  brandString<"SystemPromptId">(value);
export const toExecutorId = (value: string): ExecutorId => brandString<"ExecutorId">(value);
export const toPolicyId = (value: string): PolicyId => brandString<"PolicyId">(value);
export const toManifestHash = (value: string): ManifestHash => brandString<"ManifestHash">(value);
