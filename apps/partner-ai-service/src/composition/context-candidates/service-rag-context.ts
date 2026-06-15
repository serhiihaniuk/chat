import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  type ContextCandidate,
  type PreparedContextSection,
  type RagContextCandidate,
} from "@side-chat/partner-ai-core";

export const toRagContextCandidate = (candidate: RagContextCandidate): ContextCandidate => ({
  candidateId: candidate.candidateId,
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.RETRIEVAL_RESULT,
  sourceId: candidate.sourceId,
  trustLevel: candidate.trustLevel,
  redactionClass: candidate.redactionClass,
  content: candidate.content,
  estimatedTokens: candidate.estimatedTokens,
  priority: ragPriority(candidate.score),
  provenance: {
    sourceId: candidate.sourceId,
    label: candidate.title,
    url: candidate.url,
  },
  metadata: candidate.metadata,
});

export const createRagContextSections = (
  candidates: readonly RagContextCandidate[],
): readonly PreparedContextSection[] =>
  candidates.length > 0
    ? [
        {
          title: "Retrieved context",
          content: candidates.map(renderRagCandidate).join("\n\n"),
          priority: 75,
        },
      ]
    : [];

const renderRagCandidate = (candidate: RagContextCandidate): string =>
  [
    `Source: ${candidate.title}`,
    candidate.url ? `URL: ${candidate.url}` : undefined,
    candidate.content,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

const ragPriority = (score: number): number => Math.min(95, Math.max(40, Math.round(score * 100)));
