import type {
  ChatRequestMessage,
  ChatStreamRequest,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import {
  hashCanonicalJson,
  type AuthContext,
  type PreparedTurnContext,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import { optionalField, toJsonObject, type JsonObject } from "@side-chat/shared";

export const recordContextSnapshot = ({
  repositories,
  authContext,
  assistantTurnId,
  preparedContext,
  hostContext,
  manifestHash,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly assistantTurnId: string;
  readonly preparedContext: PreparedTurnContext;
  readonly hostContext: ChatStreamRequest["hostContext"];
  readonly manifestHash: string;
  readonly now: string;
}) =>
  repositories.recordTurnContextSnapshot({
    workspaceId: authContext.workspaceId,
    assistantTurnId,
    contextSchemaVersion: "sidechat.context-manifest.v1",
    ...optionalField("hostSurfaceId", hostContext?.origin || undefined),
    hostContextHash: hashCanonicalJson(hostContext ?? null),
    capabilitiesHash: manifestHash,
    contextRedactedJson: toContextSnapshotJson(preparedContext),
    now,
  });

export const recordUsage = ({
  repositories,
  authContext,
  assistantTurnId,
  usage,
  providerId,
  modelId,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly assistantTurnId: string;
  readonly usage: UsageMetadata | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly now: string;
}) => {
  if (!usage) return Promise.resolve();

  return repositories.recordUsage({
    workspaceId: authContext.workspaceId,
    assistantTurnId,
    runtimeStepIndex: 0,
    modelProvider: providerId,
    modelId,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: usage.totalTokens ?? 0,
    costUnits: "0",
    now,
  });
};

export const appendTurnAuditEvent = ({
  repositories,
  authContext,
  request,
  assistantTurnId,
  providerId,
  modelId,
  finishReason,
  totalTokens,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly request: ChatStreamRequest;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly finishReason: string;
  readonly totalTokens: number | undefined;
  readonly now: string;
}) =>
  repositories.appendAuditEvent({
    workspaceId: authContext.workspaceId,
    subjectId: authContext.subject.subjectId,
    actorId: authContext.actor.subjectId,
    eventType: "sidechat.assistant_turn.completed",
    targetType: "assistant_turn",
    targetId: assistantTurnId,
    metadataJson: {
      modelProvider: providerId,
      modelId,
      finishReason,
      usageTotalTokens: totalTokens ?? null,
    },
    requestId: request.requestId,
    now,
  });

export const appendMessage = ({
  repositories,
  authContext,
  conversationId,
  message,
  idempotencyKey,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly authContext: AuthContext;
  readonly conversationId: string;
  readonly message: ChatRequestMessage;
  readonly idempotencyKey: string;
  readonly now: string;
}) =>
  repositories.appendMessage({
    workspaceId: authContext.workspaceId,
    subjectId: authContext.subject.subjectId,
    conversationId,
    role: message.role,
    contentText: message.content,
    metadataJson: {},
    idempotencyKey: { value: idempotencyKey },
    now,
  });

const toContextSnapshotJson = (preparedContext: PreparedTurnContext): JsonObject =>
  toJsonObject({
    contextId: preparedContext.contextId,
    runtimeMessages: preparedContext.runtimeMessages,
    researchArtifacts: preparedContext.researchArtifacts,
    manifest: preparedContext.contextBoard.manifest,
    sections: preparedContext.contextBoard.sections.map((section) => ({
      title: section.title,
      content: section.content,
      priority: section.priority,
      ...optionalField("metadata", section.metadata),
    })),
    candidates: preparedContext.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      trustLevel: candidate.trustLevel,
      redactionClass: candidate.redactionClass,
      estimatedTokens: candidate.estimatedTokens,
      priority: candidate.priority,
      provenance: candidate.provenance,
      ...optionalField("metadata", candidate.metadata),
    })),
  });
