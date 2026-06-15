import {
  CONTEXT_ADMISSION_SELECTION_MODES,
  type ContextAdmissionConfig,
  type ContextBudgetDecision,
  type ContextCandidate,
  type ContextManifestEntry,
} from "@side-chat/partner-ai-core";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";

/**
 * Admission result for gathered model-context candidates.
 *
 * Candidate bodies remain available only for rendering the prepared context
 * board. The manifest entries and budget are the persisted explanation and must
 * stay safe to store without copying hidden adapter details.
 */
export type ContextAdmission = {
  readonly included: readonly ContextCandidate[];
  readonly dropped: readonly ContextCandidate[];
  readonly entries: readonly ContextManifestEntry[];
  readonly budget: ContextBudgetDecision;
};

/**
 * Record the configured admission budget while keeping current include-all behavior.
 *
 * Gathered host, memory, RAG, research, and tool candidates all pass through
 * today. The prepared turn still records the configured budget so later
 * deterministic admission can start trimming without changing the manifest
 * contract.
 */
export const createSimpleContextAdmission = (
  candidates: readonly ContextCandidate[],
  config: ContextAdmissionConfig = DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission,
): ContextAdmission => ({
  included: candidates,
  dropped: [],
  entries: candidates.map(toIncludedManifestEntry),
  budget: {
    policyId: config.policyId,
    selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.INCLUDE_ALL,
    maxInputTokens: config.maxInputTokens,
    reservedOutputTokens: config.reservedOutputTokens,
    sourceTokenBudgets: {
      history: config.maxHistoryTokens,
      memory: config.maxMemoryTokens,
      rag: config.maxRagTokens,
      research: config.maxResearchTokens,
    },
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
