import type { ConversationRepositoryPort } from "@side-chat/partner-ai-core";
import type {
  ChatStreamRequest,
  CompletedEvent,
  DeltaEvent,
  SidechatStreamEvent,
  StartedEvent,
} from "@side-chat/chat-protocol";
import type { SidechatRepositories } from "@side-chat/db";
import {
  appendMessage,
  appendTurnAuditEvent,
  completeTurnIfRunning,
  recordContextSnapshot,
  recordUsage,
  type PendingUserMessage,
} from "./service-persistence-recorders.js";

export type ServicePersistence = {
  readonly conversations: ConversationRepositoryPort;
  readonly persistStreamResult: (input: {
    readonly request: ChatStreamRequest;
    readonly providerId: string;
    readonly modelId: string;
    readonly events: readonly SidechatStreamEvent[];
  }) => Promise<void>;
};

export const createServicePersistence = (
  repositories: SidechatRepositories,
): ServicePersistence => {
  let pendingUserMessage: PendingUserMessage | undefined;

  return {
    conversations: {
      ensureConversation: async ({
        authContext,
        requestedConversationId,
        fallbackConversationId,
      }) => {
        const conversation = await repositories.createOrGetConversation({
          workspaceId: authContext.workspaceId,
          subjectId: authContext.subject.subjectId,
          actorId: authContext.actor.subjectId,
          conversationKey: requestedConversationId ?? fallbackConversationId,
          now: authContext.issuedAt,
        });
        return {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          conversationId: conversation.record.conversationId,
        };
      },
      appendUserMessage: async ({ authContext, conversationId, message }) => {
        const persisted = await appendMessage({
          repositories,
          authContext,
          conversationId,
          message,
          idempotencyKey: `${message.id}:user`,
          now: authContext.issuedAt,
        });
        pendingUserMessage = {
          authContext,
          conversationId,
          userMessageId: persisted.record.messageId,
        };
      },
    },
    persistStreamResult: async ({ request, providerId, modelId, events }) => {
      const pending = pendingUserMessage;
      pendingUserMessage = undefined;
      if (!pending) return;

      const started = events.find(isStartedEvent);
      if (!started) return;

      const turn = await repositories.startAssistantTurn({
        workspaceId: pending.authContext.workspaceId,
        subjectId: pending.authContext.subject.subjectId,
        actorId: pending.authContext.actor.subjectId,
        requestId: request.requestId,
        conversationId: pending.conversationId,
        userMessageId: pending.userMessageId,
        runtimeProfile: providerId,
        systemPromptVersion: "system_prompt_v1",
        contextStrategyVersion: "host_context_v1",
        toolRegistryVersion: "tool_registry_v1",
        modelProvider: providerId,
        modelId,
        now: started.createdAt,
      });

      await recordContextSnapshot({
        repositories,
        pending,
        request,
        assistantTurnId: turn.record.assistantTurnId,
        now: started.createdAt,
      });

      const assistantContent = events
        .filter(isDeltaEvent)
        .map((event) => event.content)
        .join("");
      const completed = events.find(isCompletedEvent);
      if (!completed || assistantContent.length === 0) return;

      const assistantMessage = await appendMessage({
        repositories,
        authContext: pending.authContext,
        conversationId: pending.conversationId,
        message: {
          id: `${request.message.id}:assistant`,
          role: "assistant",
          content: assistantContent,
        },
        idempotencyKey: `${request.requestId}:assistant`,
        now: completed.createdAt,
      });

      await recordUsage({
        repositories,
        pending,
        completed,
        providerId,
        modelId,
        assistantTurnId: turn.record.assistantTurnId,
      });
      await completeTurnIfRunning({
        repositories,
        pending,
        completed,
        assistantTurnId: turn.record.assistantTurnId,
        assistantMessageId: assistantMessage.record.messageId,
        status: turn.record.status,
      });
      await appendTurnAuditEvent({
        repositories,
        pending,
        request,
        completed,
        providerId,
        modelId,
        assistantTurnId: turn.record.assistantTurnId,
        shouldAppend: turn.inserted,
      });
    },
  };
};

const isStartedEvent = (event: SidechatStreamEvent): event is StartedEvent =>
  event.type === "sidechat.started";

const isDeltaEvent = (event: SidechatStreamEvent): event is DeltaEvent =>
  event.type === "sidechat.delta";

const isCompletedEvent = (event: SidechatStreamEvent): event is CompletedEvent =>
  event.type === "sidechat.completed";
