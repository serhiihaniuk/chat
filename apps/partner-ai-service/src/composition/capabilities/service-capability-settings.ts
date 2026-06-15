import {
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  type CapabilityConfig,
} from "@side-chat/partner-ai-core";

/**
 * Service-owned capability settings used to build the app graph.
 *
 * Env parsing and explicit composition options meet here before the service
 * builds manifests, context budgets, local ports, and health diagnostics.
 * Provider and runtime code consume only resolved manifests and ports; they do
 * not read service env directly.
 */
export type ServiceCapabilityConfig = CapabilityConfig;

export const DEFAULT_SERVICE_CAPABILITY_CONFIG: ServiceCapabilityConfig = {
  history: {
    mode: HISTORY_CONTEXT_MODES.DISABLED,
    maxMessages: 12,
    maxTokens: 4_000,
  },
  contextAdmission: {
    policyId: CONTEXT_ADMISSION_POLICIES.DETERMINISTIC_V1,
    maxInputTokens: 24_000,
    reservedOutputTokens: 4_000,
    maxHistoryTokens: 4_000,
  },
};
