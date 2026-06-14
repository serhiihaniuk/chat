import {
  CONTEXT_ADMISSION_SELECTION_MODES,
  HISTORY_CONTEXT_MODES,
  MEMORY_POLICY_MODES,
  type ContextAdmissionConfig,
  type HistoryContextConfig,
  type MemoryPolicy,
} from "@side-chat/partner-ai-core";
import {
  MEMORY_CAPABILITY_MODES,
  RAG_CAPABILITY_MODES,
  RESEARCH_CAPABILITY_MODES,
  type MemoryCapabilityMode,
  type RagCapabilityMode,
  type ResearchCapabilityMode,
} from "./service-capability-settings.js";
import type { CapabilityStatus } from "./capability-status.js";

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const CAPABILITY_STATES = {
  CONFIGURED: "configured",
  DISABLED: "disabled",
  MISCONFIGURED: "misconfigured",
  NOOP: "noop",
} as const;

export type CapabilityState = ObjectValue<typeof CAPABILITY_STATES>;

export const createMemoryStatus = (
  mode: MemoryCapabilityMode,
  memoryPolicy: MemoryPolicy,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (
    mode === MEMORY_CAPABILITY_MODES.DISABLED ||
    memoryPolicy.mode === MEMORY_POLICY_MODES.DISABLED
  ) {
    return {
      capability: "memory",
      state: CAPABILITY_STATES.DISABLED,
      adapterId: adapterProvided ? "configured-memory-port" : "noop-memory-port",
      policyId: memoryPolicy.policyId,
      reason: "memory policy is disabled for the active service manifest",
      safeForProduction: true,
    };
  }

  if (adapterProvided) {
    return {
      capability: "memory",
      state: CAPABILITY_STATES.CONFIGURED,
      adapterId: "configured-memory-port",
      policyId: memoryPolicy.policyId,
      safeForProduction: true,
    };
  }

  if (mode === MEMORY_CAPABILITY_MODES.POSTGRES || mode === MEMORY_CAPABILITY_MODES.EXTERNAL) {
    return {
      capability: "memory",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: "missing-memory-port",
      policyId: memoryPolicy.policyId,
      reason: `memory mode ${mode} requires a concrete memory adapter`,
      safeForProduction: false,
    };
  }

  return {
    capability: "memory",
    state: CAPABILITY_STATES.NOOP,
    adapterId: "noop-memory-port",
    policyId: memoryPolicy.policyId,
    reason: "memory policy allows recall/write but no concrete memory adapter was injected",
    safeForProduction: false,
  };
};

export const createRagStatus = (
  mode: RagCapabilityMode,
  configuredSourceCount: number,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (mode === RAG_CAPABILITY_MODES.DISABLED && configuredSourceCount === 0) {
    return {
      capability: "rag",
      state: CAPABILITY_STATES.DISABLED,
      adapterId: adapterProvided ? "configured-rag-retriever" : "noop-rag-retriever",
      configuredSourceCount,
      reason: "no retrieval sources are configured for the active service manifest",
      safeForProduction: true,
    };
  }

  if (configuredSourceCount === 0) {
    return {
      capability: "rag",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: adapterProvided ? "configured-rag-retriever" : "missing-rag-retriever",
      configuredSourceCount,
      reason: `RAG mode ${mode} requires at least one configured retrieval source`,
      safeForProduction: false,
    };
  }

  if (adapterProvided) {
    return {
      capability: "rag",
      state: CAPABILITY_STATES.CONFIGURED,
      adapterId: "configured-rag-retriever",
      configuredSourceCount,
      safeForProduction: true,
    };
  }

  if (mode !== RAG_CAPABILITY_MODES.NOOP) {
    return {
      capability: "rag",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: "missing-rag-retriever",
      configuredSourceCount,
      reason: `RAG mode ${mode} requires a concrete RAG retriever`,
      safeForProduction: false,
    };
  }

  return {
    capability: "rag",
    state: CAPABILITY_STATES.NOOP,
    adapterId: "noop-rag-retriever",
    configuredSourceCount,
    reason: "retrieval sources are configured but no concrete RAG retriever was injected",
    safeForProduction: false,
  };
};

export const createResearchStatus = (
  mode: ResearchCapabilityMode,
  configuredAgentCount: number,
  adapterProvided: boolean,
): CapabilityStatus => {
  if (mode === RESEARCH_CAPABILITY_MODES.DISABLED && configuredAgentCount === 0) {
    return {
      capability: "research",
      state: CAPABILITY_STATES.DISABLED,
      adapterId: adapterProvided ? "configured-research-agent" : "noop-research-agent",
      configuredAgentCount,
      reason: "no research agents are configured for the active service manifest",
      safeForProduction: true,
    };
  }

  if (configuredAgentCount === 0) {
    return {
      capability: "research",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: adapterProvided ? "configured-research-agent" : "missing-research-agent",
      configuredAgentCount,
      reason: `research mode ${mode} requires a configured research agent declaration`,
      safeForProduction: false,
    };
  }

  if (adapterProvided) {
    return {
      capability: "research",
      state: CAPABILITY_STATES.CONFIGURED,
      adapterId: "configured-research-agent",
      configuredAgentCount,
      safeForProduction: true,
    };
  }

  if (mode !== RESEARCH_CAPABILITY_MODES.NOOP) {
    return {
      capability: "research",
      state: CAPABILITY_STATES.MISCONFIGURED,
      adapterId: "missing-research-agent",
      configuredAgentCount,
      reason: `research mode ${mode} requires a concrete research adapter`,
      safeForProduction: false,
    };
  }

  return {
    capability: "research",
    state: CAPABILITY_STATES.NOOP,
    adapterId: "noop-research-agent",
    configuredAgentCount,
    reason: "research agents are configured but no concrete research adapter was injected",
    safeForProduction: false,
  };
};

export const createHistoryStatus = (config: HistoryContextConfig): CapabilityStatus => {
  if (config.mode === HISTORY_CONTEXT_MODES.DISABLED) {
    return {
      capability: "history",
      state: CAPABILITY_STATES.DISABLED,
      adapterId: "current-message-only-history-context",
      policyId: config.mode,
      reason: "prior conversation history is not admitted into runtime context yet",
      safeForProduction: true,
    };
  }

  return {
    capability: "history",
    state: CAPABILITY_STATES.NOOP,
    adapterId: "current-message-only-history-context",
    policyId: config.mode,
    reason: `history mode ${config.mode} is configured, but history context admission is implemented in a later phase`,
    safeForProduction: false,
  };
};

export const createContextAdmissionStatus = (config: ContextAdmissionConfig): CapabilityStatus => ({
  capability: "contextAdmission",
  state: CAPABILITY_STATES.NOOP,
  adapterId: "simple-include-all-context-admission",
  policyId: config.policyId,
  selectionMode: CONTEXT_ADMISSION_SELECTION_MODES.INCLUDE_ALL,
  recordedBudget: {
    maxInputTokens: config.maxInputTokens,
    reservedOutputTokens: config.reservedOutputTokens,
    sourceTokenBudgets: {
      history: config.maxHistoryTokens,
      memory: config.maxMemoryTokens,
      rag: config.maxRagTokens,
      research: config.maxResearchTokens,
    },
  },
  reason:
    "configured token budgets are recorded; candidate trimming is implemented in a later phase",
  safeForProduction: false,
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
