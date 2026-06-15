type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

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
 * Conversation-history behavior for context preparation.
 *
 * A service with conversation state uses this to decide whether prior messages
 * can be considered before model execution. Future modes may be parsed before
 * every mode has a concrete reader.
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
 * Budgets used when gathered candidates are admitted.
 *
 * Admission records these limits with the prepared turn. Services must keep
 * `reservedOutputTokens` below `maxInputTokens`.
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
};

/**
 * Portable capability configuration owned by partner-ai-core.
 *
 * Host and service configuration flows into this shape after local parsing.
 * Services may wrap it with deployment-specific fields, but those choices stay
 * out of the core contract.
 */
export type CapabilityConfig = {
  readonly history: HistoryContextConfig;
  readonly contextAdmission: ContextAdmissionConfig;
};
