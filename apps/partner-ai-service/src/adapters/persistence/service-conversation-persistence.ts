import type { ConversationRepositoryPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { toActorId, type SidechatRepositories } from "@side-chat/db";
import {
  appendMessage,
  conversationHistoryCutoffField,
  conversationTitleTextField,
} from "./service-persistence-recorders.js";

export const createConversationPersistence = (
  repositories: SidechatRepositories,
): ConversationRepositoryPort => ({
  ensureConversation: createEnsureConversationEffect(repositories),
  appendUserMessage: createAppendUserMessageEffect(repositories),
  prepareConversationTitle: createPrepareConversationTitleEffect(repositories),
});

const createEnsureConversationEffect =
  (repositories: SidechatRepositories): ConversationRepositoryPort["ensureConversation"] =>
  ({ authContext, requestedConversationId, fallbackConversationId }) =>
    Effect.tryPromise({
      try: async () => {
        const conversationId = requestedConversationId ?? fallbackConversationId;
        const conversation = await repositories.createOrGetConversation({
          workspaceId: authContext.workspaceId,
          subjectId: authContext.subject.subjectId,
          actorId: toActorId(authContext.actor.subjectId),
          conversationId,
          conversationKey: conversationId,
          now: authContext.issuedAt,
        });
        return {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          conversationId: conversation.record.conversationId,
          ...conversationTitleTextField(conversation.record),
          ...conversationHistoryCutoffField(conversation.record),
        };
      },
      catch: (error) => error,
    });

const createAppendUserMessageEffect =
  (repositories: SidechatRepositories): ConversationRepositoryPort["appendUserMessage"] =>
  ({ authContext, conversationId, message }) =>
    Effect.tryPromise({
      try: async () => {
        const persisted = await appendMessage({
          repositories,
          authContext,
          conversationId,
          message,
          idempotencyKey: `${message.id}:user`,
          now: authContext.issuedAt,
        });
        return {
          tenantId: authContext.tenantId,
          workspaceId: authContext.workspaceId,
          conversationId,
          messageId: persisted.record.messageId,
          sequenceIndex: persisted.record.sequenceIndex,
        };
      },
      catch: (error) => error,
    });

const createPrepareConversationTitleEffect =
  (repositories: SidechatRepositories): ConversationRepositoryPort["prepareConversationTitle"] =>
  ({ authContext, conversationId, titleText, now }) =>
    Effect.tryPromise({
      try: async () => {
        await repositories.prepareConversationTitle({
          workspaceId: authContext.workspaceId,
          subjectId: authContext.subject.subjectId,
          conversationId,
          titleText,
          now,
        });
      },
      catch: (error) => error,
    });
