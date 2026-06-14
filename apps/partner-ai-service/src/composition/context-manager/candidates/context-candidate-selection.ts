import {
  CONTEXT_ADMISSION_SELECTION_MODES,
  type ContextAdmissionConfig,
  type ContextBudgetDecision,
  type ContextCandidate,
  type ContextManifestEntry,
} from "@side-chat/partner-ai-core";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";

/**
 * Source: gathered model-context candidates.
 * Target: rendered candidate bodies plus context-manifest metadata.
 * Invariant: `entries` and `budget` must remain safe to persist; candidate
 * bodies stay in `included` or `dropped` for rendering decisions only.
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
 * Source: gathered host, memory, RAG, research, and tool candidates.
 * Target: context-board entries plus budget metadata for the prepared turn.
 * Non-guarantee: this policy does not trim or rank candidates yet; later
 * deterministic admission can use the same core `ContextAdmissionConfig`.
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
