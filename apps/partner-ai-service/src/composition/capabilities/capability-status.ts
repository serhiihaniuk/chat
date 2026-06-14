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
 * Public, secret-safe state for one service capability.
 *
 * Source: resolved manifest declarations and whether composition received a
 * concrete port implementation.
 * Target: health/readiness JSON. The status may name stable ids and counts, but
 * must not expose credentials, provider options, retrieved content, or memory
 * records.
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
 * Source: configured context admission settings.
 * Target: health/readiness JSON. This explains recorded limits only; the
 * sibling `selectionMode` field says whether the current selector enforces
 * those limits or only records them.
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
 * Memory, RAG, and research can make production unsafe when advertised without
 * concrete ports. History and context admission are reported for visibility but
 * are not used by the production adapter assertion yet.
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
 * Source: the final manifest and the ports passed into composition.
 * Target: `ServiceCapabilityStatus`.
 * Invariant: status is computed after manifest resolution so health reports the
 * same declarations that turn policy will use.
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
 * Source: secret-safe capability status.
 * Target: service composition startup.
 * Invariant: production may expose memory, RAG, or research to turn policy only
 * when a concrete port was injected; no-op declarations are local/test only.
 */
export const assertProductionCapabilityStatus = (
  status: ServiceCapabilityStatus,
  authProfile: "development" | "production",
) => {
  if (authProfile === "development") return;

  const unsafeEnabledCapabilities = [status.memory, status.rag, status.research].filter(
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
