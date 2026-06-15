import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { PreparedHistoryMessage } from "#domain/capabilities";
import type { ConversationRef, MessageRef } from "../lifecycle/conversation.js";

/**
 * Core-owned port for prior conversation messages admitted as model context.
 *
 * A service adapter with persistence access reads the conversation and returns
 * only messages that are safe for context preparation before runtime execution.
 * Database rows, reset storage details, and browser protocol DTOs stay behind
 * the service adapter.
 */
export type ConversationHistoryContextPort = {
  readonly readConversationHistory: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly conversation: ConversationRef;
    readonly currentUserMessage: MessageRef;
    readonly limit: number;
    readonly abortSignal?: AbortSignal | undefined;
  }) => Effect.Effect<readonly PreparedHistoryMessage[], unknown>;
};
