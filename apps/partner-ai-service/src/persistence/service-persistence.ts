import type {
  AuthContext,
  ConversationRepositoryPort,
} from "@side-chat/backend-core";
import type {
  ChatRequestMessage,
  ChatStreamRequest,
  CompletedEvent,
  DeltaEvent,
  JsonObject,
  SidechatStreamEvent,
  StartedEvent,
} from "@side-chat/chat-protocol";
import type { SidechatRepositories } from "@side-chat/db";

export type ServicePersistence = {
  readonly conversations: ConversationRepositoryPort;
  readonly persistStreamResult: (input: {
    readonly request: ChatStreamRequest;
    readonly providerId: string;
    readonly modelId: string;
    readonly events: readonly SidechatStreamEvent[];
  }) => Promise<void>;
};

type PendingUserMessage = {
  readonly authContext: AuthContext;
  readonly conversationId: string;
  readonly userMessageId: string;
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

      if (request.hostContext) {
        await repositories.recordTurnContextSnapshot({
          workspaceId: pending.authContext.workspaceId,
          assistantTurnId: turn.record.assistantTurnId,
          contextSchemaVersion: request.hostContext.schemaVersion,
          ...(request.hostContext.origin
            ? { hostSurfaceId: request.hostContext.origin }
            : {}),
          hostContextHash: stableHash(toJsonObject(request.hostContext)),
          capabilitiesHash: "capabilities:none",
          contextRedactedJson: toJsonObject(request.hostContext),
          now: started.createdAt,
        });
      }

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

      if (completed.usage) {
        await repositories.recordUsage({
          workspaceId: pending.authContext.workspaceId,
          assistantTurnId: turn.record.assistantTurnId,
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
      }

      if (turn.record.status === "running") {
        await repositories.completeAssistantTurn({
          workspaceId: pending.authContext.workspaceId,
          assistantTurnId: turn.record.assistantTurnId,
          assistantMessageId: assistantMessage.record.messageId,
          finishReason: completed.finishReason,
          now: completed.createdAt,
        });
      }
    },
  };
};

const appendMessage = ({
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

const isStartedEvent = (event: SidechatStreamEvent): event is StartedEvent =>
  event.type === "sidechat.started";

const isDeltaEvent = (event: SidechatStreamEvent): event is DeltaEvent =>
  event.type === "sidechat.delta";

const isCompletedEvent = (
  event: SidechatStreamEvent,
): event is CompletedEvent => event.type === "sidechat.completed";

const toJsonObject = (value: ChatStreamRequest["hostContext"]): JsonObject => ({
  schemaVersion: value?.schemaVersion ?? "unknown",
  ...(value?.origin ? { origin: value.origin } : {}),
  ...(value?.url ? { url: value.url } : {}),
  ...(value?.title ? { title: value.title } : {}),
  ...(value?.metadata ? { metadata: value.metadata } : {}),
});

const stableHash = (value: JsonObject): string =>
  `json:${JSON.stringify(value).length}`;
