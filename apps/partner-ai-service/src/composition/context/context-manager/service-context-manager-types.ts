import type { Effect } from "effect";
import type {
  AuthContext,
  ContextManagerPort,
  ContextAdmissionConfig,
  ConversationRef,
  HistoryContextConfig,
  MessageRef,
  PreparedHistoryMessage,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";

/**
 * Service-owned port for prior conversation messages admitted as model context.
 *
 * A persistence adapter reads the conversation and returns only messages safe
 * for context preparation before runtime execution; database rows, reset storage
 * details, and browser DTOs stay behind it. This lives in the service (not core)
 * because core never consumes it — the service's context manager reads history
 * through it, then implements the core `ContextManagerPort` that core does use.
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

/**
 * Service-owned inputs for preparing model-visible context.
 *
 * Ports selected by service composition flow to the context manager before
 * runtime execution. The manager returns only core-owned prepared context
 * shapes; adapter records and repository details stay hidden unless a renderer
 * admits safe text into the prepared context board.
 */
export type ServiceContextManagerOptions = {
  readonly historyContext: ConversationHistoryContextPort;
  readonly history?: HistoryContextConfig;
  readonly contextAdmission?: ContextAdmissionConfig;
};

export type PrepareTurnContextInput = Parameters<ContextManagerPort["prepareTurnContext"]>[0];

/**
 * Private gathered context before admission and rendering.
 */
export type GatheredTurnContext = {
  readonly historyMessages: readonly PreparedHistoryMessage[];
};
