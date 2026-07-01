import {
  CONTEXT_ADMISSION_DROP_REASONS,
  CONTEXT_ADMISSION_SELECTION_MODES,
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  type ContextAdmissionConfig,
  type ContextAdmissionDropReason,
  type ContextBudgetDecision,
  type ContextCandidate,
  type ContextCandidateSourceType,
  type ContextManifestEntry,
  type ContextSourceTokenBudgets,
} from "@side-chat/partner-ai-core";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";

export class ContextAdmissionBudgetError extends Error {
  readonly code = "context_admission_required_budget_exceeded";

  constructor(requiredTokens: number, availableTokens: number) {
    super(
      `Required context candidates need ${requiredTokens} tokens, but the context admission budget has ${availableTokens} available input tokens.`,
    );
    this.name = "ContextAdmissionBudgetError";
  }
}

export type DroppedContextCandidate = {
  readonly candidate: ContextCandidate;
  readonly reason: ContextAdmissionDropReason;
};

/**
 * Admission result for gathered model-context candidates.
 *
 * Candidate bodies remain available only for rendering the prepared context
 * board. The manifest entries and budget are the persisted explanation and must
 * stay safe to store without copying hidden adapter details.
 */
export type ContextAdmission = {
  readonly included: readonly ContextCandidate[];
  readonly dropped: readonly DroppedContextCandidate[];
  readonly entries: readonly ContextManifestEntry[];
  readonly budget: ContextBudgetDecision;
};

/**
 * Apply deterministic context admission before model-visible context is rendered.
 *
 * Required request context is admitted first and optional candidates are sorted
 * by priority, source class, and candidate id. The manifest records only safe
 * metadata and stable drop reasons, never candidate text.
 */
export const createBudgetedContextAdmission = (
  candidates: readonly ContextCandidate[],
  config: ContextAdmissionConfig = DEFAULT_SERVICE_CAPABILITY_CONFIG.contextAdmission,
): ContextAdmission => {
  const sourceTokenBudgets = toSourceTokenBudgets(config);
  const availableInputTokens = Math.max(0, config.maxInputTokens - config.reservedOutputTokens);
  const normalized = normalizeCandidates(candidates);
  const required = normalized.candidates.filter((candidate) => isRequiredCandidate(candidate));
  const optional = normalized.candidates
    .filter((candidate) => !isRequiredCandidate(candidate))
    .toSorted(compareOptionalCandidates);
  const requiredTokens = sumEstimatedTokens(required);
  if (requiredTokens > availableInputTokens) {
    throw new ContextAdmissionBudgetError(requiredTokens, availableInputTokens);
  }

  const admissionState = admitOptionalCandidates({
    included: required,
    dropped: normalized.dropped,
    optional,
    availableInputTokens,
    usedInputTokens: requiredTokens,
    sourceTokenBudgets,
  });

  return {
    included: admissionState.included,
    dropped: admissionState.dropped,
    entries: [
      ...admissionState.included.map(toIncludedManifestEntry),
      ...admissionState.dropped.map(toDroppedManifestEntry),
    ],
    budget: {
      policyId: config.policyId,
      selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.BUDGETED,
      maxInputTokens: config.maxInputTokens,
      reservedOutputTokens: config.reservedOutputTokens,
      sourceTokenBudgets,
      includedCandidateIds: admissionState.included.map((candidate) => candidate.candidateId),
      droppedCandidateIds: admissionState.dropped.map((drop) => drop.candidate.candidateId),
    },
  };
};

type NormalizedCandidates = {
  readonly candidates: readonly ContextCandidate[];
  readonly dropped: readonly DroppedContextCandidate[];
};

type SourceBudgetKey = keyof ContextSourceTokenBudgets;

type OptionalAdmissionInput = {
  readonly included: readonly ContextCandidate[];
  readonly dropped: readonly DroppedContextCandidate[];
  readonly optional: readonly ContextCandidate[];
  readonly availableInputTokens: number;
  readonly usedInputTokens: number;
  readonly sourceTokenBudgets: ContextSourceTokenBudgets;
};

type OptionalAdmissionState = {
  readonly included: readonly ContextCandidate[];
  readonly dropped: readonly DroppedContextCandidate[];
};

const normalizeCandidates = (candidates: readonly ContextCandidate[]): NormalizedCandidates => {
  const seenCandidateIds = new Set<string>();
  const admittedCandidates: ContextCandidate[] = [];
  const dropped: DroppedContextCandidate[] = [];

  for (const candidate of candidates) {
    if (seenCandidateIds.has(candidate.candidateId)) {
      dropped.push({ candidate, reason: CONTEXT_ADMISSION_DROP_REASONS.DUPLICATE });
      continue;
    }
    seenCandidateIds.add(candidate.candidateId);

    if (candidate.redactionClass === CONTEXT_REDACTION_CLASSES.SECRET) {
      dropped.push({ candidate, reason: CONTEXT_ADMISSION_DROP_REASONS.REDACTION_BLOCKED });
      continue;
    }

    admittedCandidates.push(candidate);
  }

  return { candidates: admittedCandidates, dropped };
};

const admitOptionalCandidates = (input: OptionalAdmissionInput): OptionalAdmissionState => {
  const included = [...input.included];
  const dropped = [...input.dropped];
  const usedSourceTokens = emptyUsedSourceTokens();
  let usedInputTokens = input.usedInputTokens;

  for (const candidate of input.optional) {
    const sourceBudgetKey = sourceBudgetKeyForCandidate(candidate);
    const sourceDropReason = sourceLimitDropReason(
      candidate,
      sourceBudgetKey,
      usedSourceTokens,
      input.sourceTokenBudgets,
    );
    if (sourceDropReason) {
      dropped.push({ candidate, reason: sourceDropReason });
      continue;
    }

    if (usedInputTokens + candidate.estimatedTokens > input.availableInputTokens) {
      dropped.push({ candidate, reason: CONTEXT_ADMISSION_DROP_REASONS.BUDGET_EXCEEDED });
      continue;
    }

    included.push(candidate);
    usedInputTokens += candidate.estimatedTokens;
    if (sourceBudgetKey) {
      usedSourceTokens[sourceBudgetKey] += candidate.estimatedTokens;
    }
  }

  return { included, dropped };
};

const sourceLimitDropReason = (
  candidate: ContextCandidate,
  sourceBudgetKey: SourceBudgetKey | undefined,
  usedSourceTokens: Record<SourceBudgetKey, number>,
  sourceTokenBudgets: ContextSourceTokenBudgets,
): ContextAdmissionDropReason | undefined => {
  if (!sourceBudgetKey) return undefined;
  if (
    usedSourceTokens[sourceBudgetKey] + candidate.estimatedTokens <=
    sourceTokenBudgets[sourceBudgetKey]
  ) {
    return undefined;
  }
  return CONTEXT_ADMISSION_DROP_REASONS.SOURCE_LIMIT_EXCEEDED;
};

const toSourceTokenBudgets = (config: ContextAdmissionConfig): ContextSourceTokenBudgets => ({
  history: config.maxHistoryTokens,
});

const isRequiredCandidate = (candidate: ContextCandidate): boolean =>
  candidate.sourceType === CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE;

const compareOptionalCandidates = (left: ContextCandidate, right: ContextCandidate): number =>
  right.priority - left.priority ||
  sourceRank(left.sourceType) - sourceRank(right.sourceType) ||
  left.candidateId.localeCompare(right.candidateId);

const sourceRank = (sourceType: ContextCandidateSourceType): number => {
  switch (sourceType) {
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TURN_PROFILE:
      return 0;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.HOST_CONTEXT:
      return 10;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CONVERSATION_HISTORY:
      return 15;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_CAPABILITY:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_RESULT:
      return 50;
  }
};

const sourceBudgetKeyForCandidate = (candidate: ContextCandidate): SourceBudgetKey | undefined => {
  switch (candidate.sourceType) {
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TURN_PROFILE:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.HOST_CONTEXT:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_CAPABILITY:
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_RESULT:
      return undefined;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CONVERSATION_HISTORY:
      return "history";
  }
};

const emptyUsedSourceTokens = (): Record<SourceBudgetKey, number> => ({
  history: 0,
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

const toDroppedManifestEntry = (drop: DroppedContextCandidate): ContextManifestEntry => ({
  candidateId: drop.candidate.candidateId,
  sourceType: drop.candidate.sourceType,
  sourceId: drop.candidate.sourceId,
  trustLevel: drop.candidate.trustLevel,
  redactionClass: drop.candidate.redactionClass,
  estimatedTokens: drop.candidate.estimatedTokens,
  included: false,
  dropReason: drop.reason,
});

const sumEstimatedTokens = (candidates: readonly ContextCandidate[]): number =>
  candidates.reduce((total, candidate) => total + candidate.estimatedTokens, 0);
