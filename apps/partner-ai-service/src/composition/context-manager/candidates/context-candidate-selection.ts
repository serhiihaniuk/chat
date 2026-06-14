import type {
  ContextBudgetDecision,
  ContextCandidate,
  ContextManifestEntry,
} from "@side-chat/partner-ai-core";

export type ContextAdmission = {
  readonly included: readonly ContextCandidate[];
  readonly dropped: readonly ContextCandidate[];
  readonly entries: readonly ContextManifestEntry[];
  readonly budget: ContextBudgetDecision;
};

// Temporary behavior: include every gathered candidate and record estimated token
// use so we can observe it. No trimming or sorting happens here yet.
export const createSimpleContextAdmission = (
  candidates: readonly ContextCandidate[],
): ContextAdmission => ({
  included: candidates,
  dropped: [],
  entries: candidates.map(toIncludedManifestEntry),
  budget: {
    maxInputTokens: 8192,
    reservedOutputTokens: 1024,
    includedCandidateIds: candidates.map((candidate) => candidate.candidateId),
    droppedCandidateIds: [],
  },
});

const toIncludedManifestEntry = (candidate: ContextCandidate): ContextManifestEntry => ({
  candidateId: candidate.candidateId,
  sourceType: candidate.sourceType,
  sourceId: candidate.sourceId,
  trustLevel: candidate.trustLevel,
  redactionClass: candidate.redactionClass,
  estimatedTokens: candidate.estimatedTokens,
  included: true,
});
