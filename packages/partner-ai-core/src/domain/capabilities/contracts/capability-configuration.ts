import type { MemoryPolicyMode } from "./capabilities.js";

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const MEMORY_AUTO_WRITE_MODES = {
  DISABLED: "disabled",
  PROPOSE_ONLY: "propose_only",
  AUTO_APPLY: "auto_apply",
} as const;

export type MemoryAutoWriteMode = ObjectValue<typeof MEMORY_AUTO_WRITE_MODES>;

export const MEMORY_DEFAULT_SCOPES = {
  CONVERSATION: "conversation",
  WORKSPACE: "workspace",
  USER: "user",
} as const;

export type MemoryDefaultScope = ObjectValue<typeof MEMORY_DEFAULT_SCOPES>;

export const MEMORY_POLICY_MODES = {
  DISABLED: "disabled",
  READ: "read",
  READ_WRITE: "read_write",
} as const satisfies Readonly<Record<string, MemoryPolicyMode>>;

export const MEMORY_POLICY_IDS = {
  DISABLED: "no_memory",
} as const;

export const CAPABILITY_FAILURE_MODES = {
  DEGRADE: "degrade",
  FAIL_TURN: "fail_turn",
} as const;

export type CapabilityFailureMode = ObjectValue<typeof CAPABILITY_FAILURE_MODES>;

export const HISTORY_CONTEXT_MODES = {
  DISABLED: "disabled",
  RECENT_MESSAGES: "recent_messages",
  RECENT_PLUS_SUMMARY: "recent_plus_summary",
} as const;

export type HistoryContextMode = ObjectValue<typeof HISTORY_CONTEXT_MODES>;

export const CONTEXT_ADMISSION_POLICIES = {
  DETERMINISTIC_V1: "deterministic_v1",
} as const;

export type ContextAdmissionPolicy = ObjectValue<typeof CONTEXT_ADMISSION_POLICIES>;

/**
 * Core contract for declaring model-visible memory behavior.
 *
 * Source: a host service or embedding app that prepares a capability manifest.
 * Target: memory policy declarations and context-preparation ports. The shape
 * names policy intent only; concrete stores such as Postgres remain service
 * adapter configuration outside partner-ai-core.
 */
export type MemoryCapabilityConfig = {
  /** Controls whether the manifest policy is read-only or read/write. */
  readonly autoWrite: MemoryAutoWriteMode;
  /** Scope published to core when memory is enabled by the host service. */
  readonly defaultScope: MemoryDefaultScope;
};

/**
 * Core contract for retrieval source declarations.
 *
 * Source: a host service or embedding app that knows its searchable sources.
 * Target: retrieval source ids in `HostCapabilityManifest` and later RAG
 * context preparation. The ids are declarations, not retriever credentials.
 */
export type RagCapabilityConfig = {
  /** Stable source ids that turn policy may allow for model-context retrieval. */
  readonly sourceIds: readonly string[];
  /** Failure behavior intended for the retrieval phase once a retriever runs. */
  readonly failureMode: CapabilityFailureMode;
};

/**
 * Core contract for pre-answer research declarations.
 *
 * Source: a host service or embedding app that can run research before runtime.
 * Target: research-agent manifest declarations and later context preparation.
 * This does not select a concrete agent implementation.
 */
export type ResearchCapabilityConfig = {
  /** Failure behavior intended for the research phase once an agent runs. */
  readonly failureMode: CapabilityFailureMode;
};

/**
 * Core contract for conversation-history admission into model context.
 *
 * Source: a host service that has access to conversation state.
 * Target: context preparation before runtime execution. Current services may
 * record this contract before implementing actual history retrieval.
 */
export type HistoryContextConfig = {
  /** Chooses whether prior messages are excluded or made available for admission. */
  readonly mode: HistoryContextMode;
  /** Maximum prior messages a history source may consider. */
  readonly maxMessages: number;
  /** Token budget reserved for history candidates. */
  readonly maxTokens: number;
};

/**
 * Core contract for admitting gathered candidates into the context board.
 *
 * Source: memory, RAG, research, history, tool, and host-context candidates.
 * Target: `ContextBudgetDecision` plus persisted context-manifest metadata.
 * Invariant: `reservedOutputTokens` must stay below `maxInputTokens`.
 */
export type ContextAdmissionConfig = {
  /** Stable admission policy id recorded in the context manifest. */
  readonly policyId: ContextAdmissionPolicy;
  /** Maximum model input tokens available to the prepared request. */
  readonly maxInputTokens: number;
  /** Output budget held back from the input window for the model response. */
  readonly reservedOutputTokens: number;
  /** Source-specific budget reserved for history candidates. */
  readonly maxHistoryTokens: number;
  /** Source-specific budget reserved for memory candidates. */
  readonly maxMemoryTokens: number;
  /** Source-specific budget reserved for RAG candidates. */
  readonly maxRagTokens: number;
  /** Source-specific budget reserved for research candidates. */
  readonly maxResearchTokens: number;
};

/**
 * Portable capability configuration contract owned by partner-ai-core.
 *
 * Source: host/service configuration after local parsing.
 * Target: capability manifests, context preparation, and turn policy. Services
 * may add adapter-selection fields around this shape, but those implementation
 * choices must not become part of the core contract.
 */
export type CapabilityConfig = {
  readonly memory: MemoryCapabilityConfig;
  readonly rag: RagCapabilityConfig;
  readonly research: ResearchCapabilityConfig;
  readonly history: HistoryContextConfig;
  readonly contextAdmission: ContextAdmissionConfig;
};
