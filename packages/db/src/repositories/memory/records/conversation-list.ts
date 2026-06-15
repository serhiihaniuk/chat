import type {
  ConversationRecord,
  ConversationRepositoryContract,
  ConversationSummaryRecord,
  MessageRecord,
} from "#schema-contract";
import type { MemoryStore } from "../store/store.js";
import type { MemoryRepositoryContext } from "./conversations.js";

export const listMemoryConversations =
  ({
    store,
  }: Pick<MemoryRepositoryContext, "store">): ConversationRepositoryContract["listConversations"] =>
  async (command) => {
    await Promise.resolve();
    return store.conversations
      .filter(
        (conversation) =>
          conversation.workspaceId === command.workspaceId &&
          conversation.subjectId === command.subjectId,
      )
      .sort(compareNewestConversation)
      .slice(0, command.limit)
      .map((conversation) => withConversationTitle(store, conversation));
  };

const compareNewestConversation = (left: ConversationRecord, right: ConversationRecord): number =>
  right.lastMessageAt.localeCompare(left.lastMessageAt);

const withConversationTitle = (
  store: MemoryStore,
  conversation: ConversationRecord,
): ConversationSummaryRecord => {
  if (conversation.titleText) return conversation;

  const titleMessage = firstVisibleUserMessage(store, conversation);
  return titleMessage
    ? { ...conversation, titleText: titleMessage.contentText }
    : { ...conversation };
};

const firstVisibleUserMessage = (
  store: MemoryStore,
  conversation: ConversationRecord,
): MessageRecord | undefined => {
  const afterSequenceIndex = conversation.historyCutoffSequenceIndex;
  return store.messages
    .filter(
      (message) =>
        message.workspaceId === conversation.workspaceId &&
        message.conversationId === conversation.conversationId &&
        message.role === "user" &&
        (afterSequenceIndex === undefined || message.sequenceIndex > afterSequenceIndex),
    )
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .at(0);
};
