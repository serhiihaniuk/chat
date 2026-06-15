import type {
  ContextAdmissionSelectionMode,
  ContextAdmissionConfig,
  HistoryContextConfig,
  MemoryPolicy,
  ResearchAgentCapability,
  RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import type {
  MemoryCapabilityMode,
  RagCapabilityMode,
  ResearchCapabilityMode,
} from "./service-capability-settings.js";
import {
  createContextAdmissionStatus,
  createHistoryStatus,
  createMemoryStatus,
  createPersistenceStatus,
  createRagStatus,
  createResearchStatus,
  CAPABILITY_STATES,
  type CapabilityState,
} from "./capability-status-builders.js";

/**
 * Public status for one service capability.
 *
 * Health endpoints may expose capability names, ids, counts, and whether a
 * concrete port was supplied. They must not expose credentials, provider
 * options, retrieved content, memory records, or raw tool/provider errors.
 */
export type CapabilityStatus = {
  readonly capability: string;
  readonly state: CapabilityState;
  readonly safeForProduction: boolean;
  readonly adapterId?: string;
  readonly policyId?: string;
  readonly configuredSourceCount?: number;
  readonly configuredAgentCount?: number;
  /** Actual context selector behavior; distinct from configured admission policy id. */
  readonly selectionMode?: ContextAdmissionSelectionMode;
  /** Secret-free context token limits recorded for health/readiness diagnostics. */
  readonly recordedBudget?: ContextAdmissionRecordedBudget;
  readonly reason?: string;
};

/**
 * Secret-free budget summary exposed by service diagnostics.
 *
 * These values come from context admission configuration and are safe for
 * readiness probes. They explain the recorded limits only; the sibling
 * `selectionMode` field says whether the current selector enforces those limits
 * or only records them.
 */
export type ContextAdmissionRecordedBudget = {
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly sourceTokenBudgets: {
    readonly history: number;
    readonly memory: number;
    readonly rag: number;
    readonly research: number;
  };
};

/**
 * Health snapshot for every optional service capability.
 *
 * Memory, RAG, research, and history can make production unsafe when advertised
 * without the concrete implementation their mode requires. Context admission is
 * reported here as the configured selector behavior and safe token budget.
 */
export type ServiceCapabilityStatus = {
  readonly memory: CapabilityStatus;
  readonly rag: CapabilityStatus;
  readonly research: CapabilityStatus;
  readonly history: CapabilityStatus;
  readonly contextAdmission: CapabilityStatus;
  readonly persistence: CapabilityStatus;
};

/**
 * Inputs needed to compute capability status after composition builds a manifest.
 *
 * Status is computed from the final manifest and the ports passed into
 * composition. This keeps health and readiness aligned with the same
 * declarations that turn policy will read during a request.
 */
export type ServiceCapabilityStatusInput = {
  readonly memoryMode: MemoryCapabilityMode;
  readonly memoryPolicy: MemoryPolicy;
  readonly memoryAdapterProvided: boolean;
  readonly ragMode: RagCapabilityMode;
  readonly retrievalSources: readonly RetrievalSourceCapability[];
  readonly ragRetrieverProvided: boolean;
  readonly researchMode: ResearchCapabilityMode;
  readonly researchAgents: readonly ResearchAgentCapability[];
  readonly researchAgentProvided: boolean;
  readonly history: HistoryContextConfig;
  readonly contextAdmission: ContextAdmissionConfig;
  readonly persistenceKind: "memory" | "postgres";
};

export class ServiceCapabilityConfigurationError extends Error {
  readonly code = "service_capability_misconfigured";

  constructor(message: string) {
    super(message);
    this.name = "ServiceCapabilityConfigurationError";
  }
}

export const createServiceCapabilityStatus = (
  input: ServiceCapabilityStatusInput,
): ServiceCapabilityStatus => ({
  memory: createMemoryStatus(input.memoryMode, input.memoryPolicy, input.memoryAdapterProvided),
  rag: createRagStatus(input.ragMode, input.retrievalSources.length, input.ragRetrieverProvided),
  research: createResearchStatus(
    input.researchMode,
    input.researchAgents.length,
    input.researchAgentProvided,
  ),
  history: createHistoryStatus(input.history),
  contextAdmission: createContextAdmissionStatus(input.contextAdmission),
  persistence: createPersistenceStatus(input.persistenceKind),
});

/**
 * Fail production boot when a model-visible capability is only declared.
 *
 * Production may expose memory, RAG, research, or summary history to turn
 * policy only when the matching implementation exists. No-op and misconfigured
 * declarations remain limited to local and test profiles, before any route can
 * accept traffic.
 */
export const assertProductionCapabilityStatus = (
  status: ServiceCapabilityStatus,
  authProfile: "development" | "production",
) => {
  if (authProfile === "development") return;

  const unsafeEnabledCapabilities = [
    status.memory,
    status.rag,
    status.research,
    status.history,
  ].filter(
    (capability) =>
      capability.state === CAPABILITY_STATES.NOOP ||
      capability.state === CAPABILITY_STATES.MISCONFIGURED,
  );
  if (unsafeEnabledCapabilities.length === 0) return;

  throw new ServiceCapabilityConfigurationError(
    `Production profile requires concrete adapters for enabled capabilities: ${unsafeEnabledCapabilities
      .map((capability) => capability.capability)
      .join(", ")}.`,
  );
};
