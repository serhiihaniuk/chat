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
        createCandidate({ candidateId: "tool", sourceType: "tool_capability", tokens: 8 }),
      ],
      createConfig(),
    );

    expect(admission.budget).toMatchObject({
      selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.BUDGETED,
      includedCandidateIds: ["current", "host", "tool"],
      droppedCandidateIds: [],
    });
    expect(admission.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateId: "host", included: true }),
        expect.objectContaining({ candidateId: "tool", included: true }),
      ]),
    );
  });

  it("drops lower-priority candidates when the input budget is exhausted", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 10 }),
        createCandidate({ candidateId: "host", sourceType: "host_context", tokens: 15 }),
        createCandidate({
          candidateId: "tool_high",
          sourceType: "tool_capability",
          tokens: 12,
          priority: 72,
        }),
        createCandidate({
          candidateId: "tool_low",
          sourceType: "tool_capability",
          tokens: 15,
          priority: 60,
        }),
      ],
      createConfig({ maxInputTokens: 45, reservedOutputTokens: 5 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current", "host", "tool_high"]);
    expect(admission.budget.droppedCandidateIds).toEqual(["tool_low"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "tool_low",
        included: false,
        dropReason: CONTEXT_ADMISSION_DROP_REASONS.BUDGET_EXCEEDED,
      }),
    );
  });

  it("uses candidate id as the stable tie-break after priority and source class", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 1 }),
        createCandidate({ candidateId: "host_b", sourceType: "host_context", tokens: 1 }),
        createCandidate({ candidateId: "host_a", sourceType: "host_context", tokens: 1 }),
        createCandidate({ candidateId: "host_c", sourceType: "host_context", tokens: 1 }),
      ],
      createConfig(),
    );

    expect(admission.budget.includedCandidateIds).toEqual([
      "current",
      "host_a",
      "host_b",
      "host_c",
    ]);
  });

  it("keeps required context ahead of optional high-scoring tool context", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 18 }),
        createCandidate({
          candidateId: "tool_high",
          sourceType: "tool_capability",
          tokens: 5,
          priority: 95,
        }),
      ],
      createConfig({ maxInputTokens: 25, reservedOutputTokens: 5 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "tool_high",
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

  it("enforces history caps before optional candidates use total budget", () => {
    const admission = createBudgetedContextAdmission(
      [
        createCandidate({ candidateId: "current", sourceType: "current_message", tokens: 2 }),
        createCandidate({
          candidateId: "history_a",
          sourceType: "conversation_history",
          tokens: 8,
          priority: 80,
        }),
        createCandidate({
          candidateId: "history_b",
          sourceType: "conversation_history",
          tokens: 8,
          priority: 79,
        }),
      ],
      createConfig({ maxHistoryTokens: 10 }),
    );

    expect(admission.budget.includedCandidateIds).toEqual(["current", "history_a"]);
    expect(admission.entries).toContainEqual(
      expect.objectContaining({
        candidateId: "history_b",
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
          candidateId: "secret_tool",
          sourceType: "tool_capability",
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
        candidateId: "secret_tool",
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
    case CONTEXT_CANDIDATE_SOURCE_TYPES.CONVERSATION_HISTORY:
      return 75;
    case CONTEXT_CANDIDATE_SOURCE_TYPES.TOOL_CAPABILITY:
      return 50;
    default:
      return 60;
  }
};
