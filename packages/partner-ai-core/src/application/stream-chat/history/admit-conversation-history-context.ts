import { optionalField } from "@side-chat/shared";
import {
  HISTORY_CONTEXT_MODES,
  type HistoryContextConfig,
  type HistoryContextDropReason,
  type HistoryContextManifest,
  type HistoryContextManifestMessage,
  type PreparedHistoryMessage,
} from "#domain/capabilities";

export type ConversationHistoryAdmission = {
  readonly admittedMessages: readonly PreparedHistoryMessage[];
  readonly manifest: HistoryContextManifest;
};

export type AdmitConversationHistoryContextInput = {
  readonly messages: readonly PreparedHistoryMessage[];
  readonly config: HistoryContextConfig;
  readonly currentUserMessageId?: string;
};

/**
 * Select same-conversation messages that may become runtime chat messages.
 *
 * The input has already passed authorization and repository normalization. This
 * function only applies the history policy: unsupported modes return no
 * messages, admitted messages keep conversation order, and the manifest records
 * ids, ordering, token estimates, and drop reasons without copying message text.
 */
export const admitConversationHistoryContext = (
  input: AdmitConversationHistoryContextInput,
): ConversationHistoryAdmission => {
  if (!supportsRecentMessageAdmission(input.config)) {
    return createEmptyHistoryAdmission(input.config);
  }

  const uniqueMessages = selectUniquePriorMessages(input.messages, input.currentUserMessageId);
  const messageWindow = trimHistoryMessageWindow(uniqueMessages, input.config.maxMessages);
  const tokenWindow = trimHistoryTokenWindow(
    messageWindow.admittedMessages,
    input.config.maxTokens,
  );
  const admittedMessages = tokenWindow.admittedMessages;
  const droppedMessages = [...messageWindow.droppedMessages, ...tokenWindow.droppedMessages];

  return {
    admittedMessages,
    manifest: {
      policyMode: input.config.mode,
      consideredMessageCount: uniqueMessages.length,
      admittedMessageCount: admittedMessages.length,
      droppedMessageCount: droppedMessages.length,
      estimatedTokens: sumEstimatedTokens(admittedMessages),
      messages: [
        ...droppedMessages.map((message) => toManifestMessage(message, false)),
        ...admittedMessages.map((message) => toManifestMessage(message, true)),
      ].toSorted((left, right) => left.sequenceIndex - right.sequenceIndex),
    },
  };
};

const supportsRecentMessageAdmission = (config: HistoryContextConfig): boolean =>
  config.mode === HISTORY_CONTEXT_MODES.RECENT_MESSAGES;

const createEmptyHistoryAdmission = (
  config: HistoryContextConfig,
): ConversationHistoryAdmission => ({
  admittedMessages: [],
  manifest: {
    policyMode: config.mode,
    consideredMessageCount: 0,
    admittedMessageCount: 0,
    droppedMessageCount: 0,
    estimatedTokens: 0,
    messages: [],
  },
});

const selectUniquePriorMessages = (
  messages: readonly PreparedHistoryMessage[],
  currentUserMessageId: string | undefined,
): readonly PreparedHistoryMessage[] => {
  const seen = new Set<string>();
  return messages
    .toSorted((left, right) => left.sequenceIndex - right.sequenceIndex)
    .filter((message) => {
      if (message.messageId === currentUserMessageId) return false;
      if (seen.has(message.messageId)) return false;
      seen.add(message.messageId);
      return true;
    });
};

const trimHistoryMessageWindow = (
  messages: readonly PreparedHistoryMessage[],
  maxMessages: number,
) => {
  const admittedStart = Math.max(0, messages.length - Math.max(0, maxMessages));
  return {
    droppedMessages: messages.slice(0, admittedStart).map((message) => ({
      ...message,
      dropReason: "message_limit" as const,
    })),
    admittedMessages: messages.slice(admittedStart),
  };
};

const trimHistoryTokenWindow = (messages: readonly PreparedHistoryMessage[], maxTokens: number) => {
  const admittedMessages = [...messages];
  const droppedMessages: (PreparedHistoryMessage & {
    readonly dropReason: "token_limit";
  })[] = [];

  while (sumEstimatedTokens(admittedMessages) > Math.max(0, maxTokens)) {
    const droppedMessage = admittedMessages.shift();
    if (!droppedMessage) break;
    droppedMessages.push({ ...droppedMessage, dropReason: "token_limit" });
  }

  return { admittedMessages, droppedMessages };
};

const toManifestMessage = (
  message: PreparedHistoryMessage & { readonly dropReason?: HistoryContextDropReason },
  included: boolean,
): HistoryContextManifestMessage => ({
  messageId: message.messageId,
  sequenceIndex: message.sequenceIndex,
  role: message.role,
  estimatedTokens: message.estimatedTokens,
  included,
  ...optionalField("dropReason", message.dropReason),
});

const sumEstimatedTokens = (messages: readonly PreparedHistoryMessage[]): number =>
  messages.reduce((total, message) => total + message.estimatedTokens, 0);
