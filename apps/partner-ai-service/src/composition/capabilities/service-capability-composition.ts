import {
  MEMORY_POLICY_IDS,
  MEMORY_POLICY_MODES,
  type HostCapabilityManifest,
  type MemoryPolicy,
  type MemoryPort,
  type RagRetrieverPort,
  type ResearchAgentCapability,
  type ResearchAgentPort,
  type RetrievalSourceCapability,
} from "@side-chat/partner-ai-core";
import { createNoopResearchAgent } from "#adapters/agents/noop-research-agent";
import { createNoopMemoryPort } from "#adapters/memory/noop-memory-port";
import { createNoopRagRetriever } from "#adapters/rag/noop-rag-retriever";
import {
  createServiceCapabilityStatus,
  ServiceCapabilityConfigurationError,
  type ServiceCapabilityStatus,
} from "./capability-status.js";
import {
  createMemoryPolicyForCapabilityConfig,
  createResearchAgentsForCapabilityConfig,
  createRetrievalSourcesForCapabilityConfig,
  inferMemoryCapabilityMode,
  inferRagCapabilityMode,
  inferResearchCapabilityMode,
} from "./capability-manifest-declarations.js";
import {
  MEMORY_CAPABILITY_MODES,
  RAG_CAPABILITY_MODES,
  RESEARCH_CAPABILITY_MODES,
  type ServiceCapabilityConfig,
  type ServiceMemoryCapabilityConfig,
  type ServiceRagCapabilityConfig,
  type ServiceResearchCapabilityConfig,
} from "./service-capability-settings.js";
import type {
  PersistenceConfig,
  ServiceCompositionOptions,
} from "#composition/service-composition";

/**
 * Manifest-facing declarations resolved from service capability config.
 *
 * Explicit composition overrides and `ServiceCapabilityConfig` become the host
 * capability manifest that core turn policy reads. Direct options still win so
 * tests and custom apps can inject exact manifest declarations without going
 * through env parsing.
 */
export type CapabilityManifestInputs = {
  readonly memoryPolicy: MemoryPolicy;
  readonly retrievalSources: readonly RetrievalSourceCapability[];
  readonly researchAgents: readonly ResearchAgentCapability[];
};

/**
 * Executable context ports selected for the service graph.
 *
 * Injected ports and capability modes become the context ports used before
 * every assistant turn. Disabled and no-op modes receive safe no-op ports;
 * concrete modes must receive real ports before HTTP routes can run.
 */
export type CapabilityAdapters = {
  readonly memory: MemoryPort;
  readonly ragRetriever: RagRetrieverPort;
  readonly researchAgent: ResearchAgentPort;
};

/**
 * Resolve what the service advertises to partner-ai-core.
 *
 * Capability config is the default declaration source. Explicit manifest
 * options remain higher priority because they are already core-shaped and are
 * used by tests and app-owned integrations.
 */
export const resolveCapabilityManifestInputs = (
  options: ServiceCompositionOptions,
  config: ServiceCapabilityConfig,
): CapabilityManifestInputs => ({
  memoryPolicy: options.memoryPolicy ?? createMemoryPolicyForCapabilityConfig(config.memory),
  retrievalSources:
    options.retrievalSources ?? createRetrievalSourcesForCapabilityConfig(config.rag),
  researchAgents:
    options.researchAgents ?? createResearchAgentsForCapabilityConfig(config.research),
});

/**
 * Build safe capability diagnostics from the final manifest and injected ports.
 *
 * The final manifest and injected ports become `/healthz` and `/readyz` status.
 * Diagnostics may report capability ids, counts, and adapter presence, but not
 * secrets, adapter internals, or context-board content.
 */
export const createCapabilityStatusForComposition = ({
  options,
  capabilityConfig,
  manifest,
  persistenceKind,
}: {
  readonly options: ServiceCompositionOptions;
  readonly capabilityConfig: ServiceCapabilityConfig;
  readonly manifest: HostCapabilityManifest;
  readonly persistenceKind: PersistenceConfig["kind"];
}): ServiceCapabilityStatus => {
  const memoryPolicy = resolveManifestMemoryPolicy(manifest);
  const memoryAdapterProvided = Boolean(options.memory);
  const ragRetrieverProvided = Boolean(options.ragRetriever);
  const researchAgentProvided = Boolean(options.researchAgent);

  return createServiceCapabilityStatus({
    memoryMode: inferMemoryCapabilityMode({
      config: capabilityConfig.memory,
      memoryPolicy,
      adapterProvided: memoryAdapterProvided,
    }),
    memoryPolicy,
    memoryAdapterProvided,
    ragMode: inferRagCapabilityMode({
      config: capabilityConfig.rag,
      sourceCount: manifest.retrievalSources.length,
      adapterProvided: ragRetrieverProvided,
    }),
    retrievalSources: manifest.retrievalSources,
    ragRetrieverProvided,
    researchMode: inferResearchCapabilityMode({
      config: capabilityConfig.research,
      agentCount: manifest.researchAgents.length,
      adapterProvided: researchAgentProvided,
    }),
    researchAgents: manifest.researchAgents,
    researchAgentProvided,
    history: capabilityConfig.history,
    contextAdmission: capabilityConfig.contextAdmission,
    persistenceKind,
  });
};

/**
 * Select the context ports that service context preparation will call.
 *
 * Disabled/no-op modes intentionally get no-op ports so local boot remains
 * runnable. Concrete modes throw during composition when the required port is
 * missing, before any route can accept a request.
 */
export const selectCapabilityAdapters = (
  config: ServiceCapabilityConfig,
  options: ServiceCompositionOptions,
): CapabilityAdapters => ({
  memory: selectMemoryPort(config.memory, options.memory),
  ragRetriever: selectRagRetriever(config.rag, options.ragRetriever),
  researchAgent: selectResearchAgent(config.research, options.researchAgent),
});

const selectMemoryPort = (
  config: ServiceMemoryCapabilityConfig,
  provided: MemoryPort | undefined,
): MemoryPort => {
  if (provided) return provided;
  if (
    config.mode === MEMORY_CAPABILITY_MODES.DISABLED ||
    config.mode === MEMORY_CAPABILITY_MODES.NOOP
  ) {
    return createNoopMemoryPort();
  }

  throw new ServiceCapabilityConfigurationError(
    `SIDECHAT_MEMORY_MODE=${config.mode} requires a concrete memory adapter.`,
  );
};

const selectRagRetriever = (
  config: ServiceRagCapabilityConfig,
  provided: RagRetrieverPort | undefined,
): RagRetrieverPort => {
  if (provided) return provided;
  if (config.mode === RAG_CAPABILITY_MODES.DISABLED || config.mode === RAG_CAPABILITY_MODES.NOOP) {
    return createNoopRagRetriever();
  }

  throw new ServiceCapabilityConfigurationError(
    `SIDECHAT_RAG_MODE=${config.mode} requires a concrete RAG retriever.`,
  );
};

const selectResearchAgent = (
  config: ServiceResearchCapabilityConfig,
  provided: ResearchAgentPort | undefined,
): ResearchAgentPort => {
  if (provided) return provided;
  if (
    config.mode === RESEARCH_CAPABILITY_MODES.DISABLED ||
    config.mode === RESEARCH_CAPABILITY_MODES.NOOP
  ) {
    return createNoopResearchAgent();
  }

  throw new ServiceCapabilityConfigurationError(
    `SIDECHAT_RESEARCH_MODE=${config.mode} requires a concrete research adapter.`,
  );
};

const DISABLED_MEMORY_POLICY: MemoryPolicy = {
  policyId: MEMORY_POLICY_IDS.DISABLED,
  mode: MEMORY_POLICY_MODES.DISABLED,
  scopes: [],
};

const resolveManifestMemoryPolicy = (manifest: HostCapabilityManifest): MemoryPolicy =>
  manifest.memoryPolicies[0] ?? DISABLED_MEMORY_POLICY;
