import {
  CONTEXT_ADMISSION_DROP_REASONS,
  CONTEXT_ADMISSION_SELECTION_MODES,
  CONTEXT_CANDIDATE_SOURCE_TYPES,
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  type ContextAdmissionConfig,
  type ContextCandidate,
} from "@side-chat/partner-ai-core";
import { describe, expect, it } from "vitest";
import {
  ContextAdmissionBudgetError,
  createBudgetedContextAdmission,
} from "./context-candidate-selection.js";

describe("createBudgetedContextAdmission", () => {
  it("includes every optional candidate when the configured budget has room", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 4 }),
        createCandidate({ candidateId: "host", sourceType: "host_context", tokens: 6 }),
        createCandidate({ candidateId: "memory", sourceType: "memory", tokens: 8 }),
      ],
      createConfig(),
    );

    expect(admission.budget).toMatchObject({
      selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.BUDGETED,
      includedCandidateIds: ["current", "host", "memory"],
      droppedCandidateIds: [],
    });
    expect(admission.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: "host", included: true }),
        expect.objectContaining({ candidateId: "memory", included: true }),
      ]),
    );
  });

  it("drops lower-priority candidates when the input budget is exhausted", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 10 }),
        createCandidate({ candidateId: "host", sourceType: "host_context", tokens: 15 }),
        createCandidate({ candidateId: "memory", sourceType: "memory", tokens: 15, priority: 72 }),
        createCandidate({
          candidateId: "rag",
          sourceType: "retrieval_result",
          tokens: 15,
          priority: 60,
        }),
      ],
      createConfig({ maxInputTokens: 45, reservedOutputTokens: 5 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current", "host", "memory"]);
    expect(admission.budget.droppedCandidateIds).toEqual(["rag"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "rag",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.BUDGET_EXCEEDED,
      }),
    );
  });

  it("uses candidate id as the stable tie-break after priority and source class", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 1 }),
        createCandidate({ candidateId: "memory_b", sourceType: "memory", tokens: 1, priority: 80 }),
        createCandidate({ candidateId: "memory_a", sourceType: "memory", tokens: 1, priority: 80 }),
        createCandidate({ candidateId: "memory_c", sourceType: "memory", tokens: 1, priority: 80 }),
      ],
      createConfig(),
    );

    expect(admission.budget.includedCandidateIds).toEqual([
      "current",
      "memory_a",
      "memory_b",
      "memory_c",
    ]);
  });

  it("keeps required context ahead of optional high-scoring retrieval", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 18 }),
        createCandidate({
          candidateId: "rag_high",
          sourceType: "retrieval_result",
          tokens: 5,
          priority: 95,
        }),
      ],
      createConfig({ maxInputTokens: 25, reservedOutputTokens: 5 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "rag_high",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.BUDGET_EXCEEDED,
      }),
    );
  });

  it("fails before runtime when required context exceeds the configured budget", () => {
    expect(() =>
      createBudgetedContextAdmission(
        [createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 22 })],
        createConfig({ maxInputTokens: 25, reservedOutputTokens: 5 }),
      ),
    ).toThrow(ContextAdmissionBudgetError);
  });

  it("enforces source-specific caps before optional candidates use total budget", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 2 }),
        createCandidate({ candidateId: "memory_a", sourceType: "memory", tokens: 8, priority: 80 }),
        createCandidate({ candidateId: "memory_b", sourceType: "memory", tokens: 8, priority: 79 }),
      ],
      createConfig({ maxMemoryTokens: 10 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current", "memory_a"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "memory_b",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.SOURCE_LIMIT_EXCEEDED,
      }),
    );
  });

  it("records duplicate and redaction drops without copying candidate content", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 1 }),
        createCandidate({ candidateId: "host", sourceType: "host_context", tokens: 1 }),
        createCandidate({ candidateId: "host", sourceType: "host_context", tokens: 1 }),
        createCandidate({
          candidateId: "secret_memory",
          sourceType: "memory",
          tokens: 1,
          redactionClass: CONTEXT_REDACTION_CLASSES.SECRET,
        }),
      ],
      createConfig(),
    );

    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "host",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.DUPLICATE,
      }),
    );
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "secret_memory",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.REDACTION_BLOCKED,
      }),
    );
    expect(admission.entries).not.toContainEqual(
      expect.objectContaining({ content: expect.any(String) }),
    );
  });
});

const createConfig = (overrides: Partial<ContextAdmissionConfig> = {}): ContextAdmissionConfig => ({
  policyId: "deterministic_v1",
  maxInputTokens: 100,
  reservedOutputTokens: 10,
  maxHistoryTokens: 30,
  maxMemoryTokens: 30,
  maxRagTokens: 30,
  maxResearchTokens: 30,
  ...overrides,
});

const createCandidate = ({
  candidateId,
  sourceType,
  tokens,
  priority = defaultPriorityForSource(sourceType),
  redactionClass = CONTEXT_REDACTION_CLASSES.WORKSPACE_CONFIDENTIAL,
}: {
  readonly candidateId: string;
  readonly sourceType: ContextCandidate["sourceType"];
  readonly tokens: number;
  readonly priority?: number;
  readonly redactionClass?: ContextCandidate["redactionClass"];
}): ContextCandidate => ({
  candidateId,
  sourceType,
  sourceId: `${sourceType}_${candidateId}`,
  trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  redactionClass,
  content: `content for ${candidateId}`,
  estimatedTokens: tokens,
  priority,
  provenance: {
    sourceId: `${sourceType}_${candidateId}`,
    label: candidateId,
  },
});

const defaultPriorityForSource = (sourceType: ContextCandidate["sourceType"]): number => {
  switch (sourceType) {
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CURRENT_MESSAGE:
      return 100;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.HOST_CONTEXT:
      return 80;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.MEMORY:
      return 72;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.RETRIEVAL_RESULT:
      return 70;
    default:
      return 60;
  }
};
