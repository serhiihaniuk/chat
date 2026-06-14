import type {
  ContextCandidate,
  ContextManagerPort,
  MemoryPort,
  MemoryRecord,
  RagContextCandidate,
  RagRetrieverPort,
  ResearchArtifact,
  ResearchAgentPort,
} from "@side-chat/partner-ai-core";

export type ServiceContextManagerOptions = {
  readonly ragRetriever: RagRetrieverPort;
  readonly memory: MemoryPort;
  readonly researchAgent: ResearchAgentPort;
};

export type PrepareTurnContextInput = Parameters<ContextManagerPort["prepareTurnContext"]>[0];

export type GatheredTurnContext = {
  readonly ragCandidates: readonly RagContextCandidate[];
  readonly memoryRecords: readonly MemoryRecord[];
  readonly researchCandidates: readonly ContextCandidate[];
  readonly researchArtifacts: readonly ResearchArtifact[];
};
