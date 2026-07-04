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
    /**
     * Deterministic conversation key for a conversationless request.
     *
     * The fresh `fallbackConversationId` differs on every retry, so keying the
     * conversation on it would mint a new orphan per retry. Deriving the key from
     * the request id lets a retried conversationless POST converge on the one
     * conversation the first attempt created.
     */
    readonly fallbackConversationKey: string;
    /** Record clock sourced from the caller's clock port, not from auth evidence. */
    readonly now: string;
  }) => Effect.Effect<ConversationRef, unknown>;
  /**
   * Append the user message, idempotently on its message id.
   *
   * A retried request carrying the same message id must return the SAME
   * `MessageRef` (same `messageId`, same `sequenceIndex`) rather than appending a
   * duplicate, so a reconnect or double-submit cannot fork the conversation. The
   * `@side-chat/db` `sidechatRepositoryContract` kit
   * (`packages/db/src/testing/repository-contract.test-support.ts`) is the
   * executable spec — its "conversation and message idempotency" case asserts the
   * second append reuses the first record.
   */
  readonly appendUserMessage: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly message: ChatRequestMessage;
    /** Record clock sourced from the caller's clock port, not from auth evidence. */
    readonly now: string;
  }) => Effect.Effect<MessageRef, unknown>;
  readonly prepareConversationTitle: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly titleText: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
};
