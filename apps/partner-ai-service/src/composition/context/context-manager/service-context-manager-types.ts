import type {
  ContextManagerPort,
  ContextAdmissionConfig,
  ConversationHistoryContextPort,
  HistoryContextConfig,
  PreparedHistoryMessage,
} from "@side-chat/partner-ai-core";

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
