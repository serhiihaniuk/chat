import {
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  toContextCandidateId,
  toContextSourceId,
  type ContextCandidate,
  type MemoryRecord,
  type PreparedContextSection,
} from "@side-chat/partner-ai-core";

export const toMemoryContextCandidate = (record: MemoryRecord): ContextCandidate => ({
  candidateId: toContextCandidateId(`memory_${record.memoryId}`),
  sourceType: CONTEXT_CANDIDATE_SOURCE_TYPES.MEMORY,
  sourceId: toContextSourceId(record.memoryId),
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
  content: record.content,
  estimatedTokens: estimateTokens(record.content),
  priority: memoryPriority(record.confidence),
  provenance: {
    sourceId: toContextSourceId(record.memoryId),
    label: `${record.scope} memory`,
  },
  metadata: record.metadata,
});

export const createMemoryContextSections = (
  records: readonly MemoryRecord[],
): readonly PreparedContextSection[] =>
  records.length > 0
    ? [
        {
          title: "Memory",
          content: records.map(renderMemoryRecord).join("\n\n"),
          priority: 72,
        },
      ]
    : [];

const renderMemoryRecord = (record: MemoryRecord): string =>
  [`Scope: ${record.scope}`, `Updated: ${record.updatedAt}`, record.content].join("\n");

const estimateTokens = (content: string): number => Math.max(1, Math.ceil(content.length / 4));

const memoryPriority = (confidence: number): number =>
  Math.min(90, Math.max(45, Math.round(confidence * 100)));
