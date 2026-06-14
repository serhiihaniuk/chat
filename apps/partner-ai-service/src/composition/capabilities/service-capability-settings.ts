import {
  CAPABILITY_FAILURE_MODES,
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  MEMORY_AUTO_WRITE_MODES,
  MEMORY_DEFAULT_SCOPES,
  type CapabilityConfig,
  type MemoryCapabilityConfig,
  type RagCapabilityConfig,
  type ResearchCapabilityConfig,
} from "@side-chat/partner-ai-core";

/**
 * Service-owned capability settings layered on the core contract.
 *
 * partner-ai-core owns the portable fields that affect manifests, policy, and
 * context preparation. This service adds only deployable choices: whether a
 * capability is disabled, no-op, or backed by a concrete adapter.
 */
type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

export const MEMORY_CAPABILITY_MODES = {
  DISABLED: "disabled",
  NOOP: "noop",
  POSTGRES: "postgres",
  EXTERNAL: "external",
} as const;

export type MemoryCapabilityMode = ObjectValue<typeof MEMORY_CAPABILITY_MODES>;

export const RAG_CAPABILITY_MODES = {
  DISABLED: "disabled",
  NOOP: "noop",
  STATIC: "static",
  HTTP: "http",
  EXTERNAL: "external",
} as const;

export type RagCapabilityMode = ObjectValue<typeof RAG_CAPABILITY_MODES>;

export const RESEARCH_CAPABILITY_MODES = {
  DISABLED: "disabled",
  NOOP: "noop",
  EXTERNAL: "external",
  LANGGRAPH: "langgraph",
} as const;

export type ResearchCapabilityMode = ObjectValue<typeof RESEARCH_CAPABILITY_MODES>;

/**
 * Service memory settings declared before the service graph is built.
 *
 * Source: `SIDECHAT_MEMORY_*` env keys or `ServiceCompositionOptions.capabilities`.
 * Target: the core `MemoryPolicy` published in the host capability manifest.
 * Invariant: this declaration never creates storage; concrete memory work still
 * requires a `MemoryPort` selected by service composition.
 */
export type ServiceMemoryCapabilityConfig = MemoryCapabilityConfig & {
  /** Chooses whether memory is absent, declared as no-op, or requires a concrete port. */
  readonly mode: MemoryCapabilityMode;
};

/**
 * Retrieval capability declared before the service graph is built.
 *
 * Source: `SIDECHAT_RAG_*` env keys or `ServiceCompositionOptions.capabilities`.
 * Target: retrieval source declarations in the core host capability manifest.
 * Invariant: source ids describe what a turn policy may expose; a real
 * retriever still requires a `RagRetrieverPort` selected by composition.
 */
export type ServiceRagCapabilityConfig = RagCapabilityConfig & {
  /** Chooses whether RAG is absent, declared as no-op, or requires a concrete retriever. */
  readonly mode: RagCapabilityMode;
};

/**
 * Pre-answer research capability declared before the service graph is built.
 *
 * Source: `SIDECHAT_RESEARCH_*` env keys or `ServiceCompositionOptions.capabilities`.
 * Target: research-agent declarations in the core host capability manifest.
 * Invariant: this only advertises a research lane; execution still requires a
 * `ResearchAgentPort` selected by composition.
 */
export type ServiceResearchCapabilityConfig = ResearchCapabilityConfig & {
  /** Chooses whether research is absent, declared as no-op, or requires a concrete agent. */
  readonly mode: ResearchCapabilityMode;
};

/**
 * Service-owned capability control plane.
 *
 * Source: env parsing or explicit composition options.
 * Target: manifest declarations, context-manager budgets, selected local ports,
 * and safe health diagnostics. Provider/runtime code consumes only the resolved
 * manifest and ports; it does not read service env directly.
 */
export type ServiceCapabilityConfig = Omit<CapabilityConfig, "memory" | "rag" | "research"> & {
  readonly memory: ServiceMemoryCapabilityConfig;
  readonly rag: ServiceRagCapabilityConfig;
  readonly research: ServiceResearchCapabilityConfig;
};

export const DEFAULT_SERVICE_CAPABILITY_CONFIG: ServiceCapabilityConfig = {
  memory: {
    mode: MEMORY_CAPABILITY_MODES.DISABLED,
    autoWrite: MEMORY_AUTO_WRITE_MODES.DISABLED,
    defaultScope: MEMORY_DEFAULT_SCOPES.USER,
  },
  rag: {
    mode: RAG_CAPABILITY_MODES.DISABLED,
    sourceIds: [],
    failureMode: CAPABILITY_FAILURE_MODES.DEGRADE,
  },
  research: {
    mode: RESEARCH_CAPABILITY_MODES.DISABLED,
    failureMode: CAPABILITY_FAILURE_MODES.DEGRADE,
  },
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
    maxMemoryTokens: 2_000,
    maxRagTokens: 8_000,
    maxResearchTokens: 4_000,
  },
};
