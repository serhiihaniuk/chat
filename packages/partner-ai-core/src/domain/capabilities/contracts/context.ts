import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantProfile,
  ContextCandidateSourceType,
  ContextRedactionClass,
  ContextTrustLevel,
  TurnPolicyDecision,
} from "./capabilities.js";
import type { ContextAdmissionPolicy } from "./capability-configuration.js";
import type { ResearchArtifact } from "./research-artifacts.js";

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const CONTEXT_ADMISSION_SELECTION_MODES = {
  INCLUDE_ALL: "include_all",
  BUDGETED: "budgeted",
} as const;

export type ContextAdmissionSelectionMode = ObjectValue<typeof CONTEXT_ADMISSION_SELECTION_MODES>;

export type ContextCandidateProvenance = {
  readonly sourceId: string;
  readonly label: string;
  readonly url?: string;
};

/**
 * Candidate considered for one prepared context board.
 *
 * Source: host request data, authorized context ports, or service-owned
 * capability declarations. Target: context admission and `ContextManifest`
 * entries. Invariant: candidate content becomes model-visible only after
 * admission; manifest metadata keeps provenance, trust, redaction, and token
 * estimates without exposing adapter internals.
 */
export type ContextCandidate = {
  readonly candidateId: string;
  readonly sourceType: ContextCandidateSourceType;
  readonly sourceId: string;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly content: string;
  readonly estimatedTokens: number;
  readonly priority: number;
  readonly provenance: ContextCandidateProvenance;
  readonly metadata?: JsonObject;
};

/**
 * Source-specific token caps recorded with a context decision.
 *
 * Source: the portable `ContextAdmissionConfig` selected before context
 * preparation. Target: persisted manifest metadata and runtime debug context.
 * These numbers explain configured limits; they do not prove candidates were
 * trimmed unless `selectionMode` says the admission selector is budgeted.
 */
export type ContextSourceTokenBudgets = {
  readonly history: number;
  readonly memory: number;
  readonly rag: number;
  readonly research: number;
};

/**
 * Safe explanation of how gathered context was admitted for one turn.
 *
 * Source: the context manager after candidate selection. Target: context
 * manifest metadata stored with the turn. Invariant: `policyId` records the
 * configured policy, while `selectionMode` records the behavior actually used.
 */
export type ContextBudgetDecision = {
  /** Configured admission policy selected before context preparation. */
  readonly policyId: ContextAdmissionPolicy;
  /** Selector behavior actually used for this turn. */
  readonly selectionMode: ContextAdmissionSelectionMode;
  /** Total model input budget, in approximate tokens. */
  readonly maxInputTokens: number;
  /** Output budget held back from the input window, in approximate tokens. */
  readonly reservedOutputTokens: number;
  /** Source caps recorded from configuration, in approximate tokens. */
  readonly sourceTokenBudgets: ContextSourceTokenBudgets;
  readonly includedCandidateIds: readonly string[];
  readonly droppedCandidateIds: readonly string[];
};

export type ContextManifestEntry = {
  readonly candidateId: string;
  readonly sourceType: ContextCandidateSourceType;
  readonly sourceId: string;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly estimatedTokens: number;
  readonly included: boolean;
};

export type ContextManifest = {
  readonly manifestId: string;
  readonly manifestHash: string;
  readonly profileId: string;
  readonly profileVersion: string;
  readonly entries: readonly ContextManifestEntry[];
  readonly budget: ContextBudgetDecision;
  readonly createdAt: string;
};

export type PreparedContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority: number;
  readonly metadata?: JsonObject;
};

export type PreparedContextBoard = {
  readonly sections: readonly PreparedContextSection[];
  readonly manifest: ContextManifest;
};

export type PreparedRuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * Final model-context package produced by core before runtime execution.
 *
 * Source: the core context manager after policy and guards have selected what
 * the turn may use. Target: the runtime request and redacted context snapshots.
 * Invariant: runtime receives this package as-is and must not gather hidden host
 * context or conversation history outside it.
 */
export type PreparedTurnContext = {
  readonly contextId: string;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly candidates: readonly ContextCandidate[];
  readonly researchArtifacts: readonly ResearchArtifact[];
  readonly contextBoard: PreparedContextBoard;
  readonly runtimeMessages: readonly PreparedRuntimeMessage[];
};
