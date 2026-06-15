import {
  CONTEXT_ADMISSION_SELECTION_MODES,
  HISTORY_CONTEXT_MODES,
  type ContextAdmissionConfig,
  type HistoryContextConfig,
} from "@side-chat/partner-ai-core";
import type { CapabilityStatus } from "./capability-status.js";

/**
 * Turns service config into secret-safe status rows for health routes.
 *
 * Inputs from composition become health and readiness diagnostics. They
 * preserve only ids, budgets, and adapter labels; credentials, context text,
 * and provider errors stay hidden.
 */
type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const CAPABILITY_STATES = {
  CONFIGURED: "configured",
  DISABLED: "disabled",
  MISCONFIGURED: "misconfigured",
} as const;

export type CapabilityState = ObjectValue<typeof CAPABILITY_STATES>;

export const createHistoryStatus = (config: HistoryContextConfig): CapabilityStatus => {
  if (config.mode === HISTORY_CONTEXT_MODES.DISABLED) {
    return {
      capability: "history",
      state: CAPABILITY_STATES.DISABLED,
      adapterId: "repository-conversation-history-context",
      policyId: config.mode,
      reason: "history context is disabled for the active service configuration",
      safeForProduction: true,
    };
  }

  if (config.mode === HISTORY_CONTEXT_MODES.RECENT_PLUS_SUMMARY) {
    return {
      capability: "history",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: "missing-history-summary-generator",
      policyId: config.mode,
      reason:
        "recent_plus_summary requires history summarization, which is not implemented yet; use recent_messages for current history context",
      safeForProduction: false,
    };
  }

  return {
    capability: "history",
    state: CAPABILITY_STATES.CONFIGURED,
    adapterId: "repository-conversation-history-context",
    policyId: config.mode,
    safeForProduction: true,
  };
};

export const createContextAdmissionStatus = (config: ContextAdmissionConfig): CapabilityStatus => ({
  capability: "contextAdmission",
  state: CAPABILITY_STATES.CONFIGURED,
  adapterId: "deterministic-budgeted-context-admission",
  policyId: config.policyId,
  selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.BUDGETED,
  recordedBudget: {
    maxInputTokens: config.maxInputTokens,
    reservedOutputTokens: config.reservedOutputTokens,
    sourceTokenBudgets: {
      history: config.maxHistoryTokens,
    },
  },
  reason: "configured token budgets are enforced before optional context reaches runtime",
  safeForProduction: true,
});

export const createPersistenceStatus = (kind: "memory" | "postgres"): CapabilityStatus => {
  if (kind === "postgres") {
    return {
      capability: "persistence",
      state: CAPABILITY_STATES.CONFIGURED,
      adapterId: "postgres-drizzle-sidechat-repositories",
      safeForProduction: true,
    };
  }

  return {
    capability: "persistence",
    state: CAPABILITY_STATES.CONFIGURED,
    adapterId: "memory-sidechat-repositories",
    reason: "process-local memory persistence resets when the service restarts",
    safeForProduction: false,
  };
};
