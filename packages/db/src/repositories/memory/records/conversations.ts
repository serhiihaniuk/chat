import type {
  ConversationRecord,
  ConversationRepositoryContract,
  MessageRecord,
} from "#schema-contract";
import { DbRepositoryError } from "../../errors.js";
import { replaceConversation, type MemoryStore } from "../store/store.js";
import { result, type createIdGenerator } from "../../repository-utils.js";
import { listMemoryConversations } from "./conversation-list.js";

type MemoryIds = ReturnType<typeof createIdGenerator>;
type MemoryStoreContext = Pick<MemoryRepositoryContext, "store">;

export type MemoryRepositoryContext = {
  readonly store: MemoryStore;
  readonly ids: MemoryIds;
};

export const getMemoryConversation = (
  store: MemoryStore,
  workspaceId: string,
  conversationId: string,
): ConversationRecord => {
  const conversation = store.conversations.find(
    (candidate) =>
      candidate.workspaceId === workspaceId && candidate.conversationId === conversationId,
  );
  if (!conversation) {
    throw new DbRepositoryError(
      "record_not_found",
      "Conversation does not exist in the requested workspace.",
    );
  }
  return conversation;
};

export const requireSubjectConversation = (
  store: MemoryStore,
  workspaceId: string,
  subjectId: string,
  conversationId: string,
): ConversationRecord => {
  const conversation = getMemoryConversation(store, workspaceId, conversationId);
  if (conversation.subjectId !== subjectId) {
    throw new DbRepositoryError(
      "cross_tenant_access_denied",
      "Conversation belongs to a different subject.",
    );
  }
  return conversation;
};

export const createMemoryConversationRepository = ({
  ids,
  store,
}: MemoryRepositoryContext): ConversationRepositoryContract => ({
  createOrGetConversation: createOrGetMemoryConversation({ ids, store }),
  appendMessage: appendMemoryMessage({ ids, store }),
  readConversationHistory: readMemoryConversationHistory({ ids, store }),
  listConversations: listMemoryConversations({ store }),
  prepareConversationTitle: prepareMemoryConversationTitle({ store }),
  resetConversation: resetMemoryConversation({ ids, store }),
});

const createOrGetMemoryConversation =
  ({
    ids,
    store,
  }: MemoryRepositoryContext): ConversationRepositoryContract["createOrGetConversation"] =>
  async (command) => {
    await Promise.resolve();
    const existing = store.conversations.find(
      (conversation) =>
        conversation.workspaceId === command.workspaceId &&
        conversation.subjectId === command.subjectId &&
        conversation.conversationKey === command.conversationKey,
    );
    if (existing) return result(existing, false);

    const conversation: ConversationRecord = {
      workspaceId: command.workspaceId,
      conversationId: command.conversationId ?? ids.next("conversation"),
      subjectId: command.subjectId,
      conversationKey: command.conversationKey,
      status: "active",
      createdByActorId: command.actorId,
      createdAt: command.now,
      updatedAt: command.now,
      lastMessageAt: command.now,
    };
    store.conversations.push(conversation);
    return result(conversation, true);
  };

const appendMemoryMessage =
  ({ ids, store }: MemoryRepositoryContext): ConversationRepositoryContract["appendMessage"] =>
  async (command) => {
    await Promise.resolve();
    const conversation = requireSubjectConversation(
      store,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const existing = store.messages.find(
      (message) =>
        message.workspaceId === command.workspaceId &&
        message.idempotencyKey === command.idempotencyKey.value,
    );
    if (existing) return result(existing, false);

    const sequenceIndex = store.messages.filter(
      (message) =>
        message.workspaceId === command.workspaceId &&
        message.conversationId === command.conversationId,
    ).length;
    const message: MessageRecord = {
      workspaceId: command.workspaceId,
      messageId: ids.next("message"),
      conversationId: command.conversationId,
      role: command.role,
      contentText: command.contentText,
      metadataJson: command.metadataJson,
      sequenceIndex,
      idempotencyKey: command.idempotencyKey.value,
      createdAt: command.now,
      updatedAt: command.now,
    };
    store.messages.push(message);
    replaceConversation(store, {
      ...conversation,
      status: "active",
      updatedAt: command.now,
      lastMessageAt: command.now,
    });
    return result(message, true);
  };

const readMemoryConversationHistory =
  ({ store }: MemoryRepositoryContext): ConversationRepositoryContract["readConversationHistory"] =>
  async (command) => {
    await Promise.resolve();
    const conversation = requireSubjectConversation(
      store,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const afterSequenceIndex = historyLowerBound(
      command.afterSequenceIndex,
      conversation.historyCutoffSequenceIndex,
    );
    return store.messages
      .filter(
        (message) =>
          message.workspaceId === command.workspaceId &&
          message.conversationId === command.conversationId &&
          (afterSequenceIndex === undefined || message.sequenceIndex > afterSequenceIndex) &&
          (command.beforeSequenceIndex === undefined ||
            message.sequenceIndex < command.beforeSequenceIndex),
      )
      .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
      .slice(-command.limit);
  };

const prepareMemoryConversationTitle =
  ({ store }: MemoryStoreContext): ConversationRepositoryContract["prepareConversationTitle"] =>
  async (command) => {
    await Promise.resolve();
    const conversation = requireSubjectConversation(
      store,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    if (conversation.titleText) return conversation;

    const titled = { ...conversation, titleText: command.titleText, updatedAt: command.now };
    replaceConversation(store, titled);
    return titled;
  };

const resetMemoryConversation =
  ({ store }: MemoryRepositoryContext): ConversationRepositoryContract["resetConversation"] =>
  async (command) => {
    await Promise.resolve();
    const conversation = requireSubjectConversation(
      store,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    const reset = {
      ...conversation,
      status: "reset" as const,
      ...nextHistoryCutoff(store, command.workspaceId, command.conversationId),
      updatedAt: command.now,
    };
    replaceConversation(store, reset);
    return reset;
  };

const nextHistoryCutoff = (
  store: MemoryStore,
  workspaceId: string,
  conversationId: string,
): Pick<ConversationRecord, "historyCutoffSequenceIndex"> | Record<string, never> => {
  const sequenceIndexes = store.messages
    .filter(
      (message) => message.workspaceId === workspaceId && message.conversationId === conversationId,
    )
    .map((message) => message.sequenceIndex);
  if (sequenceIndexes.length === 0) return {};

  return { historyCutoffSequenceIndex: Math.max(...sequenceIndexes) };
};

const historyLowerBound = (
  requestedAfter: number | undefined,
  resetCutoff: number | undefined,
): number | undefined => {
  if (requestedAfter === undefined) return resetCutoff;
  if (resetCutoff === undefined) return requestedAfter;
  return Math.max(requestedAfter, resetCutoff);
};
