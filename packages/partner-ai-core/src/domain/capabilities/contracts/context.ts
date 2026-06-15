import { brandString, type Brand, type JsonObject } from "@side-chat/shared";
import type {
  AssistantProfile,
  ContextCandidateSourceType,
  ContextRedactionClass,
  ContextTrustLevel,
  ProfileId,
  TurnPolicyDecision,
} from "./capabilities.js";
import type { ContextAdmissionPolicy, HistoryContextMode } from "./capability-configuration.js";

/**
 * Core-owned model context contracts for one prepared assistant turn.
 *
 * Host page context and conversation history become `ContextCandidate` values
 * or prepared runtime messages, then an admitted `PreparedContextBoard` and
 * provider-neutral `PreparedRuntimeMessage` list. Candidate text may appear in
 * board sections and runtime messages; manifests keep only ids, source labels,
 * trust, redaction, token estimates, and budgets.
 *
 * Update this comment when context preparation gains a new source type, changes
 * what becomes model-visible, or moves admission responsibility across packages.
 */

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export type ContextId = Brand<string, "ContextId">;
export type ContextCandidateId = Brand<string, "ContextCandidateId">;
export type ContextSourceId = Brand<string, "ContextSourceId">;
export type ContextManifestId = Brand<string, "ContextManifestId">;
export type ContextManifestHash = Brand<string, "ContextManifestHash">;
export type MessageId = Brand<string, "MessageId">;

export const toContextId = (value: string): ContextId => brandString<"ContextId">(value);
export const toContextCandidateId = (value: string): ContextCandidateId =>
  brandString<"ContextCandidateId">(value);
export const toContextSourceId = (value: string): ContextSourceId =>
  brandString<"ContextSourceId">(value);
export const toContextManifestId = (value: string): ContextManifestId =>
  brandString<"ContextManifestId">(value);
export const toContextManifestHash = (value: string): ContextManifestHash =>
  brandString<"ContextManifestHash">(value);
export const toMessageId = (value: string): MessageId => brandString<"MessageId">(value);

export const CONTEXT_ADMISSION_SELECTION_MODES = {
  INCLUDE_ALL: "include_all",
  BUDGETED: "budgeted",
} as const;

export type ContextAdmissionSelectionMode = ObjectValue<typeof CONTEXT_ADMISSION_SELECTION_MODES>;

export const CONTEXT_ADMISSION_DROP_REASONS = {
  BUDGET_EXCEEDED: "budget_exceeded",
  SOURCE_LIMIT_EXCEEDED: "source_limit_exceeded",
  POLICY_DISABLED: "policy_disabled",
  REDACTION_BLOCKED: "redaction_blocked",
  DUPLICATE: "duplicate",
} as const;

export type ContextAdmissionDropReason = ObjectValue<typeof CONTEXT_ADMISSION_DROP_REASONS>;

/**
 * Human-readable origin for a context candidate.
 *
 * Provenance may be recorded in manifests or diagnostics. It should identify
 * the source well enough for audit without carrying adapter credentials,
 * provider-native metadata, or private repository records.
 */
export type ContextCandidateProvenance = {
  readonly sourceId: ContextSourceId;
  readonly label: string;
  readonly url?: string | undefined;
};

/**
 * Candidate considered for one prepared context board.
 *
 * Candidates can come from host request data or authorized context ports. Their
 * content becomes model-visible only after admission; persisted metadata keeps
 * provenance, trust, redaction, and token estimates without adapter internals.
 */
export type ContextCandidate = {
  readonly candidateId: ContextCandidateId;
  readonly sourceType: ContextCandidateSourceType;
  readonly sourceId: ContextSourceId;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly content: string;
  readonly estimatedTokens: number;
  readonly priority: number;
  readonly provenance: ContextCandidateProvenance;
  readonly metadata?: JsonObject | undefined;
};

/**
 * Source-specific token caps recorded with a context decision.
 *
 * These values come from the portable `ContextAdmissionConfig` selected before
 * context preparation. They explain configured limits in manifests and runtime
 * debug context, but they do not prove candidates were trimmed unless
 * `selectionMode` says the selector is budgeted.
 */
export type ContextSourceTokenBudgets = {
  readonly history: number;
};

/**
 * Safe explanation of how gathered context was admitted for one turn.
 *
 * After candidate selection, the admission result becomes audit metadata for
 * the turn. `policyId` records configured operator intent, while
 * `selectionMode` records the selector behavior that actually ran.
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
  readonly includedCandidateIds: readonly ContextCandidateId[];
  readonly droppedCandidateIds: readonly ContextCandidateId[];
};

/**
 * Content-free manifest row for one candidate considered during admission.
 *
 * The context manifest records ids, source, trust, redaction, token estimate,
 * and inclusion result. Candidate text stays out of the manifest so persistence
 * and diagnostics can explain admission without copying model-visible content.
 */
export type ContextManifestEntry = {
  readonly candidateId: ContextCandidateId;
  readonly sourceType: ContextCandidateSourceType;
  readonly sourceId: ContextSourceId;
  readonly trustLevel: ContextTrustLevel;
  readonly redactionClass: ContextRedactionClass;
  readonly estimatedTokens: number;
  readonly included: boolean;
  /** Stable, content-free reason recorded only when the candidate was dropped. */
  readonly dropReason?: ContextAdmissionDropReason | undefined;
};

/**
 * Audit manifest for the prepared context board.
 *
 * This is the durable explanation of what context was considered and admitted.
 * It must preserve candidate identity and budgets, not full content or adapter
 * internals.
 */
export type ContextManifest = {
  readonly manifestId: ContextManifestId;
  readonly manifestHash: ContextManifestHash;
  readonly profileId: ProfileId;
  readonly profileVersion: string;
  readonly entries: readonly ContextManifestEntry[];
  readonly history: HistoryContextManifest;
  readonly budget: ContextBudgetDecision;
  readonly createdAt: string;
};

/**
 * Model-visible section admitted into the prepared context board.
 *
 * Sections are ordered and prioritized before runtime execution. Metadata is
 * optional because source-specific adapter detail must not be required by the
 * runtime boundary.
 */
export type PreparedContextSection = {
  readonly title: string;
  readonly content: string;
  readonly priority: number;
  readonly metadata?: JsonObject | undefined;
};

/**
 * Context package passed to runtime beside rendered messages.
 *
 * Runtime may read the board, but it must not fetch more host data or
 * reinterpret the manifest as permission to access more history.
 */
export type PreparedContextBoard = {
  readonly sections: readonly PreparedContextSection[];
  readonly manifest: ContextManifest;
};

export type PreparedHistoryMessageRole = "user" | "assistant";

/**
 * Prior conversation message safe for runtime message rendering.
 *
 * Service adapters turn authorized conversation records into this model-visible
 * role/content shape before context admission. Repository rows, reset storage
 * details, and browser protocol DTOs stay inside the service adapter instead of
 * crossing from persistence into core.
 */
export type PreparedHistoryMessage = {
  readonly messageId: MessageId;
  readonly sequenceIndex: number;
  readonly role: PreparedHistoryMessageRole;
  readonly content: string;
  /** Approximate input-token cost used by recent history admission. */
  readonly estimatedTokens: number;
};

export type HistoryContextDropReason = "message_limit" | "token_limit";

export type HistoryContextManifestMessage = {
  readonly messageId: MessageId;
  readonly sequenceIndex: number;
  readonly role: PreparedHistoryMessageRole;
  readonly estimatedTokens: number;
  readonly included: boolean;
  readonly dropReason?: HistoryContextDropReason | undefined;
};

/**
 * Content-safe explanation of conversation-history admission.
 *
 * The context manager stores this with the prepared context so operators can
 * audit which prior messages moved from history into model context. Message
 * text never appears here; the manifest records ids, order, token estimates,
 * and drop reasons only.
 */
export type HistoryContextManifest = {
  readonly policyMode: HistoryContextMode;
  readonly consideredMessageCount: number;
  readonly admittedMessageCount: number;
  readonly droppedMessageCount: number;
  readonly estimatedTokens: number;
  readonly messages: readonly HistoryContextManifestMessage[];
};

/**
 * Final role/content message shape passed to agent-runtime.
 *
 * Core renders system instructions, admitted context, current user input, and
 * selected history into this provider-neutral format. Provider-specific message
 * DTOs are created later inside agent-runtime.
 */
export type PreparedRuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * Final model-context package produced by core before runtime execution.
 *
 * Core builds this after policy and guards select what the turn may use. Runtime
 * receives the package from core as-is and must not gather extra host data or
 * conversation history.
 */
export type PreparedTurnContext = {
  readonly contextId: ContextId;
  readonly profile: AssistantProfile;
  readonly policyDecision: TurnPolicyDecision;
  readonly history: HistoryContextManifest;
  readonly candidates: readonly ContextCandidate[];
  readonly contextBoard: PreparedContextBoard;
  readonly runtimeMessages: readonly PreparedRuntimeMessage[];
};
