import type {
  MemoryPolicy,
  ResearchAgentCapability,
  RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";

export type CapabilityState = "disabled" | "noop" | "configured" | "misconfigured";

export type CapabilityStatus = {
  readonly capability: string;
  readonly state: CapabilityState;
  readonly safeForProduction: boolean;
  readonly adapterId?: string;
  readonly policyId?: string;
  readonly configuredSourceCount?: number;
  readonly configuredAgentCount?: number;
  readonly reason?: string;
};

export type ServiceCapabilityStatus = {
  readonly memory: CapabilityStatus;
  readonly rag: CapabilityStatus;
  readonly research: CapabilityStatus;
  readonly history: CapabilityStatus;
  readonly contextAdmission: CapabilityStatus;
  readonly persistence: CapabilityStatus;
};

export type ServiceCapabilityStatusInput = {
  readonly memoryPolicy: MemoryPolicy;
  readonly memoryAdapterProvided: boolean;
  readonly retrievalSources: readonly RetrievalSourceCapability[];
  readonly ragRetrieverProvided: boolean;
  readonly researchAgents: readonly ResearchAgentCapability[];
  readonly researchAgentProvided: boolean;
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
  memory: createMemoryStatus(input.memoryPolicy, input.memoryAdapterProvided),
  rag: createRagStatus(input.retrievalSources.length, input.ragRetrieverProvided),
  research: createResearchStatus(input.researchAgents.length, input.researchAgentProvided),
  history: createHistoryStatus(),
  contextAdmission: createContextAdmissionStatus(),
  persistence: createPersistenceStatus(input.persistenceKind),
});

export const assertProductionCapabilityStatus = (
  status: ServiceCapabilityStatus,
  authProfile: "development" | "production",
) => {
  if (authProfile === "development") return;

  const unsafeEnabledCapabilities = [status.memory, status.rag, status.research].filter(
    (capability) => capability.state === "noop" || capability.state === "misconfigured",
  );
  if (unsafeEnabledCapabilities.length === 0) return;

  throw new ServiceCapabilityConfigurationError(
    `Production profile requires concrete adapters for enabled capabilities: ${unsafeEnabledCapabilities
      .map((capability) => capability.capability)
      .join(", ")}.`,
  );
};

const createMemoryStatus = (
  memoryPolicy: MemoryPolicy,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (memoryPolicy.mode === "disabled") {
    return {
      capability: "memory",
      state: "disabled",
      adapterId: adapterProvided ? "configured-memory-port" : "noop-memory-port",
      policyId: memoryPolicy.policyId,
      reason: "memory policy is disabled for the active service manifest",
      safeForProduction: true,
    };
  }

  if (adapterProvided) {
    return {
      capability: "memory",
      state: "configured",
      adapterId: "configured-memory-port",
      policyId: memoryPolicy.policyId,
      safeForProduction: true,
    };
  }

  return {
    capability: "memory",
    state: "noop",
    adapterId: "noop-memory-port",
    policyId: memoryPolicy.policyId,
    reason: "memory policy allows recall/write but no concrete memory adapter was injected",
    safeForProduction: false,
  };
};

const createRagStatus = (
  configuredSourceCount: number,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (configuredSourceCount === 0) {
    return {
      capability: "rag",
      state: "disabled",
      adapterId: adapterProvided ? "configured-rag-retriever" : "noop-rag-retriever",
      configuredSourceCount,
      reason: "no retrieval sources are configured for the active service manifest",
      safeForProduction: true,
    };
  }

  if (adapterProvided) {
    return {
      capability: "rag",
      state: "configured",
      adapterId: "configured-rag-retriever",
      configuredSourceCount,
      safeForProduction: true,
    };
  }

  return {
    capability: "rag",
    state: "noop",
    adapterId: "noop-rag-retriever",
    configuredSourceCount,
    reason: "retrieval sources are configured but no concrete RAG retriever was injected",
    safeForProduction: false,
  };
};

const createResearchStatus = (
  configuredAgentCount: number,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (configuredAgentCount === 0) {
    return {
      capability: "research",
      state: "disabled",
      adapterId: adapterProvided ? "configured-research-agent" : "noop-research-agent",
      configuredAgentCount,
      reason: "no research agents are configured for the active service manifest",
      safeForProduction: true,
    };
  }

  if (adapterProvided) {
    return {
      capability: "research",
      state: "configured",
      adapterId: "configured-research-agent",
      configuredAgentCount,
      safeForProduction: true,
    };
  }

  return {
    capability: "research",
    state: "noop",
    adapterId: "noop-research-agent",
    configuredAgentCount,
    reason: "research agents are configured but no concrete research adapter was injected",
    safeForProduction: false,
  };
};

const createHistoryStatus = (): CapabilityStatus => ({
  capability: "history",
  state: "disabled",
  adapterId: "current-message-only-history-context",
  reason: "prior conversation history is not admitted into runtime context yet",
  safeForProduction: true,
});

const createContextAdmissionStatus = (): CapabilityStatus => ({
  capability: "contextAdmission",
  state: "noop",
  adapterId: "simple-include-all-context-admission",
  policyId: "include-all-context-admission",
  reason: "all gathered candidates are included; token-budget trimming is not configured yet",
  safeForProduction: false,
});

const createPersistenceStatus = (kind: "memory" | "postgres"): CapabilityStatus => {
  if (kind === "postgres") {
    return {
      capability: "persistence",
      state: "configured",
      adapterId: "postgres-drizzle-sidechat-repositories",
      safeForProduction: true,
    };
  }

  return {
    capability: "persistence",
    state: "configured",
    adapterId: "memory-sidechat-repositories",
    reason: "process-local memory persistence resets when the service restarts",
    safeForProduction: false,
  };
};
