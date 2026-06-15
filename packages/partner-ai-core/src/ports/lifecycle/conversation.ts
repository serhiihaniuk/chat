import type { ChatRequestMessage } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

export type ConversationRef = WorkspaceRef & {
  readonly conversationId: string;
  readonly titleText?: string | undefined;
  readonly historyCutoffSequenceIndex?: number | undefined;
};

export type MessageRef = WorkspaceRef & {
  readonly conversationId: string;
  readonly messageId: string;
  /** Repository sequence used to read prior messages without duplicating the current user message. */
  readonly sequenceIndex: number;
};

export type ConversationRepositoryPort = {
  readonly ensureConversation: (input: {
    readonly authContext: AuthContext;
    readonly requestedConversationId?: string | undefined;
    readonly fallbackConversationId: string;
  }) => Effect.Effect<ConversationRef, unknown>;
  readonly appendUserMessage: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly message: ChatRequestMessage;
  }) => Effect.Effect<MessageRef, unknown>;
  readonly prepareConversationTitle: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly titleText: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
};
