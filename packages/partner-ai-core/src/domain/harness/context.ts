import type { JsonObject } from "@side-chat/chat-protocol";
import type {
  AssistantProfile,
  ContextCandidateSourceType,
  ContextRedactionClass,
  ContextTrustLevel,
  TurnPolicyDecision,
} from "./capabilities.js";

export type ContextCandidateProvenance = {
  readonly sourceId: string;
  readonly label: string;
  readonly url?: string;
};

/**
 * One candidate input the context manager may render for a turn.
 *
 * Candidates carry provenance, trust, redaction, and token estimates so the
 * final context manifest can reconstruct why model-visible content was
 * included or dropped.
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

export type ContextBudgetDecision = {
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
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
 * Runtime receives these messages and the prepared context board as-is. It may
 * render them for a provider, but it must not gather hidden host context or
 * conversation history outside this object.
 */
export type PreparedTurnContext = {
  readonly contextId: string;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly candidates: readonly ContextCandidate[];
  readonly contextBoard: PreparedContextBoard;
  readonly runtimeMessages: readonly PreparedRuntimeMessage[];
};
