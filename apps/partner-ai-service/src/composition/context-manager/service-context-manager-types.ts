import type {
  ContextCandidate,
  ContextManagerPort,
  MemoryPort,
  MemoryRecord,
  PreparedHistoryMessage,
  RagContextCandidate,
  RagRetrieverPort,
  ResearchArtifact,
  ResearchAgentPort,
  ContextAdmissionConfig,
  ConversationHistoryContextPort,
  HistoryContextConfig,
} from "@side-chat/partner-ai-core";

/**
 * Service-owned inputs for preparing model-visible context.
 *
 * Ports selected by service composition flow to the context manager before
 * runtime execution. The manager returns only core-owned prepared context
 * shapes; adapter records and raw retrieved content stay hidden unless a
 * renderer admits safe text into the prepared context board.
 */
export type ServiceContextManagerOptions = {
  readonly historyContext: ConversationHistoryContextPort;
  readonly ragRetriever: RagRetrieverPort;
  readonly memory: MemoryPort;
  readonly researchAgent: ResearchAgentPort;
  readonly history?: HistoryContextConfig;
  readonly contextAdmission?: ContextAdmissionConfig;
};

export type PrepareTurnContextInput = Parameters<ContextManagerPort["prepareTurnContext"]>[0];

/**
 * Private gathered context before admission and rendering.
 *
 * Source adapters return different record shapes, so the service keeps them
 * separated until candidate creation and context-board rendering decide what
 * becomes model-visible and what remains only manifest metadata.
 */
export type GatheredTurnContext = {
  readonly historyMessages: readonly PreparedHistoryMessage[];
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly memoryRecords: readonly MemoryRecord[];
  readonly researchCandidates: readonly ContextCandidate[];
  readonly researchArtifacts: readonly ResearchArtifact[];
};
