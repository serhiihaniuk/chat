import type {
  AssistantTurnLifecyclePort,
  AssistantTurnStatus,
  ConversationRepositoryPort,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { toActorId, type SidechatRepositories } from "@side-chat/db";
import {
  appendMessage,
  appendTurnAuditEvent,
  recordContextSnapshot,
  recordUsage,
} from "./service-persistence-recorders.js";
import { createConversationPersistence } from "./service-conversation-persistence.js";

export type ServicePersistence = {
  readonly conversations: ConversationRepositoryPort;
  readonly assistantTurns: AssistantTurnLifecyclePort;
};

export const createServicePersistence = (
  repositories: SidechatRepositories,
): ServicePersistence => ({
  conversations: createConversationPersistence(repositories),
  assistantTurns: createAssistantTurnPersistence(repositories),
});

const createAssistantTurnPersistence = (
  repositories: SidechatRepositories,
): AssistantTurnLifecyclePort => ({
  startAssistantTurn: createStartAssistantTurnEffect(repositories),
  recordContextSnapshot: createRecordContextSnapshotEffect(repositories),
  completeAssistantTurn: createCompleteAssistantTurnEffect(repositories),
  failAssistantTurn: createFailAssistantTurnEffect(repositories),
});

const createStartAssistantTurnEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["startAssistantTurn"] =>
  ({
    authContext,
    conversation,
    userMessage,
    request,
    profileId,
    profileVersion,
    systemPromptId,
    manifestHash,
    providerId,
    modelId,
    now,
  }) =>
    Effect.tryPromise({
      try: async () => {
        const turn = await repositories.startAssistantTurn({
          workspaceId: authContext.workspaceId,
          subjectId: authContext.subject.subjectId,
          actorId: toActorId(authContext.actor.subjectId),
          requestId: request.requestId,
          conversationId: conversation.conversationId,
          userMessageId: userMessage.messageId,
          runtimeProfile: profileId,
          systemPromptVersion: `${systemPromptId}@${profileVersion}`,
          contextStrategyVersion: "sidechat.context-manager.v1",
          toolRegistryVersion: manifestHash,
          modelProvider: providerId,
          modelId,
          now,
        });
        return {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          conversationId: conversation.conversationId,
          assistantTurnId: turn.record.assistantTurnId,
          status: turn.record.status as AssistantTurnStatus,
          inserted: turn.inserted,
        };
      },
      catch: (error) => error,
    });

const createRecordContextSnapshotEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["recordContextSnapshot"] =>
  ({ authContext, assistantTurnId, preparedContext, hostContext, manifestHash, now }) =>
    Effect.tryPromise({
      try: () =>
        recordContextSnapshot({
          repositories,
          authContext,
          assistantTurnId,
          preparedContext,
          hostContext,
          manifestHash,
          now,
        }),
      catch: (error) => error,
    });

const createCompleteAssistantTurnEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["completeAssistantTurn"] =>
  ({
    authContext,
    conversation,
    request,
    assistantTurnId,
    assistantContent,
    finishReason,
    usage,
    providerId,
    modelId,
    now,
  }) =>
    Effect.tryPromise({
      try: async () => {
        const assistantMessage = await appendMessage({
          repositories,
          authContext,
          conversationId: conversation.conversationId,
          message: {
            id: `${request.message.id}:assistant`,
            role: "assistant",
            content: assistantContent,
          },
          idempotencyKey: `${request.requestId}:assistant`,
          now,
        });
        await recordUsage({
          repositories,
          authContext,
          assistantTurnId,
          usage,
          providerId,
          modelId,
          now,
        });
        await repositories.completeAssistantTurn({
          workspaceId: authContext.workspaceId,
          assistantTurnId,
          assistantMessageId: assistantMessage.record.messageId,
          finishReason,
          now,
        });
        await appendTurnAuditEvent({
          repositories,
          authContext,
          request,
          assistantTurnId,
          providerId,
          modelId,
          finishReason,
          totalTokens: usage?.totalTokens,
          now,
        });
      },
      catch: (error) => error,
    });

const createFailAssistantTurnEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["failAssistantTurn"] =>
  ({ authContext, assistantTurnId, status, errorCode, now }) =>
    Effect.tryPromise({
      try: () =>
        repositories.failAssistantTurn({
          workspaceId: authContext.workspaceId,
          assistantTurnId,
          status,
          errorCode,
          now,
        }),
      catch: (error) => error,
    }).pipe(Effect.asVoid);
