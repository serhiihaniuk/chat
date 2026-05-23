import type {
  ChatRequestMessage,
  ChatStreamRequest,
  CompletedEvent,
  JsonObject,
} from "@side-chat/chat-protocol";
import type { AuthContext } from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";

export type PendingUserMessage = {
  readonly authContext: AuthContext;
  readonly conversationId: string;
  readonly userMessageId: string;
};

export const recordContextSnapshot = ({
  repositories,
  pending,
  request,
  assistantTurnId,
  now,
}: {
  readonly repositories: SidechatRepositories;
  readonly pending: PendingUserMessage;
  readonly request: ChatStreamRequest;
  readonly assistantTurnId: string;
  readonly now: string;
}) => {
  if (!request.hostContext) return Promise.resolve();

  return repositories.recordTurnContextSnapshot({
    workspaceId: pending.authContext.workspaceId,
    assistantTurnId,
    contextSchemaVersion: request.hostContext.schemaVersion,
    ...(request.hostContext.origin
      ? { hostSurfaceId: request.hostContext.origin }
      : {}),
    hostContextHash: stableHash(toJsonObject(request.hostContext)),
    capabilitiesHash: "capabilities:none",
    contextRedactedJson: toJsonObject(request.hostContext),
    now,
  });
};

export const recordUsage = ({
  repositories,
  pending,
  completed,
  providerId,
  modelId,
  assistantTurnId,
}: {
  readonly repositories: SidechatRepositories;
  readonly pending: PendingUserMessage;
  readonly completed: CompletedEvent;
  readonly providerId: string;
  readonly modelId: string;
  readonly assistantTurnId: string;
}) => {
  if (!completed.usage) return Promise.resolve();

  return repositories.recordUsage({
    workspaceId: pending.authContext.workspaceId,
    assistantTurnId,
    runtimeStepIndex: 0,
    modelProvider: providerId,
    modelId,
    inputTokens: completed.usage.inputTokens ?? 0,
    outputTokens: completed.usage.outputTokens ?? 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    totalTokens: completed.usage.totalTokens ?? 0,
    costUnits: "0",
    now: completed.createdAt,
  });
};

export const completeTurnIfRunning = ({
  repositories,
  pending,
  completed,
  assistantTurnId,
  assistantMessageId,
  status,
}: {
  readonly repositories: SidechatRepositories;
  readonly pending: PendingUserMessage;
  readonly completed: CompletedEvent;
  readonly assistantTurnId: string;
  readonly assistantMessageId: string;
  readonly status: string;
}) => {
  if (status !== "running") return Promise.resolve();

  return repositories.completeAssistantTurn({
    workspaceId: pending.authContext.workspaceId,
    assistantTurnId,
    assistantMessageId,
    finishReason: completed.finishReason,
    now: completed.createdAt,
  });
};

export const appendTurnAuditEvent = ({
  repositories,
  pending,
  request,
  completed,
  providerId,
  modelId,
  assistantTurnId,
  shouldAppend,
}: {
  readonly repositories: SidechatRepositories;
  readonly pending: PendingUserMessage;
  readonly request: ChatStreamRequest;
  readonly completed: CompletedEvent;
  readonly providerId: string;
  readonly modelId: string;
  readonly assistantTurnId: string;
  readonly shouldAppend: boolean;
}) => {
  if (!shouldAppend) return Promise.resolve();

  return repositories.appendAuditEvent({
    workspaceId: pending.authContext.workspaceId,
    subjectId: pending.authContext.subject.subjectId,
    actorId: pending.authContext.actor.subjectId,
    eventType: "sidechat.assistant_turn.completed",
    targetType: "assistant_turn",
    targetId: assistantTurnId,
    metadataJson: {
      modelProvider: providerId,
      modelId,
      finishReason: completed.finishReason,
      usageTotalTokens: completed.usage?.totalTokens ?? null,
    },
    requestId: request.requestId,
    now: completed.createdAt,
  });
};

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

const toJsonObject = (value: ChatStreamRequest["hostContext"]): JsonObject => ({
  schemaVersion: value?.schemaVersion ?? "unknown",
  ...(value?.origin ? { origin: value.origin } : {}),
  ...(value?.url ? { url: value.url } : {}),
  ...(value?.title ? { title: value.title } : {}),
  ...(value?.metadata ? { metadata: value.metadata } : {}),
});

const stableHash = (value: JsonObject): string =>
  `json:${JSON.stringify(value).length}`;
