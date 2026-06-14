import {
  CONTEXT_TRUST_LEVELS,
  MEMORY_AUTO_WRITE_MODES,
  MEMORY_POLICY_IDS,
  MEMORY_POLICY_MODES,
  RESEARCH_CONTEXT_AGENT_ID,
  type MemoryPolicy,
  type ResearchAgentCapability,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import {
  MEMORY_CAPABILITY_MODES,
  RAG_CAPABILITY_MODES,
  RESEARCH_CAPABILITY_MODES,
  type MemoryCapabilityMode,
  type RagCapabilityMode,
  type ResearchCapabilityMode,
  type ServiceMemoryCapabilityConfig,
  type ServiceRagCapabilityConfig,
  type ServiceResearchCapabilityConfig,
} from "./service-capability-settings.js";

/**
 * Convert the service memory declaration into the core manifest policy.
 *
 * The output tells partner-ai-core which scopes a turn may request. It does not
 * imply a working memory store; composition separately selects either a no-op
 * port or a concrete `MemoryPort`.
 */
export const createMemoryPolicyForCapabilityConfig = (
  config: ServiceMemoryCapabilityConfig,
): MemoryPolicy => {
  if (config.mode === MEMORY_CAPABILITY_MODES.DISABLED) {
    return {
      policyId: MEMORY_POLICY_IDS.DISABLED,
      mode: MEMORY_POLICY_MODES.DISABLED,
      scopes: [],
    };
  }

  return {
    policyId: `configured_${config.defaultScope}_memory`,
    mode:
      config.autoWrite === MEMORY_AUTO_WRITE_MODES.DISABLED
        ? MEMORY_POLICY_MODES.READ
        : MEMORY_POLICY_MODES.READ_WRITE,
    scopes: [config.defaultScope],
  };
};

/**
 * Convert service RAG source ids into manifest source declarations.
 *
 * Descriptions are intentionally generic: health and manifest consumers should
 * see stable source ids and trust level, not private retriever implementation
 * details or credentials.
 */
export const createRetrievalSourcesForCapabilityConfig = (
  config: ServiceRagCapabilityConfig,
): readonly RetrievalSourceCapability[] => {
  if (config.mode === RAG_CAPABILITY_MODES.DISABLED) return [];

  return config.sourceIds.map((sourceId) => ({
    sourceId,
    description: `Configured retrieval source ${sourceId}.`,
    trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
  }));
};

/**
 * Convert service research mode into a manifest research-agent declaration.
 *
 * The current phase supports one pre-answer research lane. The declaration lets
 * policy decide whether a turn may request research; the selected port decides
 * whether anything can actually execute.
 */
export const createResearchAgentsForCapabilityConfig = (
  config: ServiceResearchCapabilityConfig,
): readonly ResearchAgentCapability[] => {
  if (config.mode === RESEARCH_CAPABILITY_MODES.DISABLED) return [];

  return [
    {
      researchAgentId: RESEARCH_CONTEXT_AGENT_ID,
      description: "Configured pre-answer research agent.",
    },
  ];
};

/**
 * Derive the memory status mode from the resolved manifest and injected port.
 *
 * Direct `ServiceCapabilityConfig` modes win. When callers still pass legacy
 * `memoryPolicy` options, this keeps diagnostics honest by reporting no-op
 * unless a concrete memory port was also injected.
 */
export const inferMemoryCapabilityMode = ({
  config,
  memoryPolicy,
  adapterProvided,
}: {
  readonly config: ServiceMemoryCapabilityConfig;
  readonly memoryPolicy: MemoryPolicy;
  readonly adapterProvided: boolean;
}): MemoryCapabilityMode => {
  if (config.mode !== MEMORY_CAPABILITY_MODES.DISABLED) return config.mode;
  if (memoryPolicy.mode === MEMORY_POLICY_MODES.DISABLED) {
    return MEMORY_CAPABILITY_MODES.DISABLED;
  }
  return adapterProvided ? MEMORY_CAPABILITY_MODES.EXTERNAL : MEMORY_CAPABILITY_MODES.NOOP;
};

/**
 * Derive the RAG status mode from manifest declarations and injected retriever.
 *
 * This bridges old direct `retrievalSources` options with the new capability
 * config: declared sources without a retriever are observable as no-op instead
 * of silently looking production-ready.
 */
export const inferRagCapabilityMode = ({
  config,
  sourceCount,
  adapterProvided,
}: {
  readonly config: ServiceRagCapabilityConfig;
  readonly sourceCount: number;
  readonly adapterProvided: boolean;
}): RagCapabilityMode => {
  if (config.mode !== RAG_CAPABILITY_MODES.DISABLED) return config.mode;
  if (sourceCount === 0) return RAG_CAPABILITY_MODES.DISABLED;
  return adapterProvided ? RAG_CAPABILITY_MODES.EXTERNAL : RAG_CAPABILITY_MODES.NOOP;
};

/**
 * Derive the research status mode from manifest declarations and injected agent.
 *
 * This keeps health output tied to the final manifest the turn policy sees,
 * while still showing whether composition received an executable research port.
 */
export const inferResearchCapabilityMode = ({
  config,
  agentCount,
  adapterProvided,
}: {
  readonly config: ServiceResearchCapabilityConfig;
  readonly agentCount: number;
  readonly adapterProvided: boolean;
}): ResearchCapabilityMode => {
  if (config.mode !== RESEARCH_CAPABILITY_MODES.DISABLED) return config.mode;
  if (agentCount === 0) return RESEARCH_CAPABILITY_MODES.DISABLED;
  return adapterProvided ? RESEARCH_CAPABILITY_MODES.EXTERNAL : RESEARCH_CAPABILITY_MODES.NOOP;
};
