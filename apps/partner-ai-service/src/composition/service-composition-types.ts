import type { AgentExecutor, AgentRuntime, RuntimeTool } from "@side-chat/agent-runtime";
import type {
  ApprovalPolicy,
  ContextManagerPort,
  HostCapabilityManifestPort,
  HostCommandCapability,
  MemoryPolicy,
  MemoryPort,
  RagRetrieverPort,
  ResearchAgentCapability,
  ResearchAgentPort,
  RetrievalSourceCapability,
  ToolCapability,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCapabilityStatus } from "#composition/capabilities/capability-status";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";

/**
 * Service composition contracts for the deployable Side Chat service.
 *
 * These types describe the service-only layer between environment/options and
 * product core ports. They can name adapters, repositories, provider
 * declarations, and diagnostics, but not provider stream parts or browser UI
 * state.
 */
export type PersistenceConfig =
  | { readonly kind: "memory" }
  | { readonly kind: "postgres"; readonly databaseUrl: string };

/**
 * Runtime provider declaration accepted by service composition.
 *
 * Provider secrets and transport overrides stay private to composition. Core
 * and HTTP routes receive only runtime ids and the prepared AgentRuntime port.
 */
export type RuntimeConfig =
  | { readonly provider: "fake"; readonly modelId?: string }
  | {
      readonly provider: "openai";
      readonly apiKey: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
      readonly baseUrl?: string;
      readonly fetch?: typeof fetch;
      readonly reasoningEffort?: OpenAIReasoningEffort;
      readonly reasoningSummary?: OpenAIReasoningSummary;
    };

/**
 * Runtime capabilities that are app-owned but model-callable only after policy.
 *
 * Tool declarations feed the host capability manifest, while RuntimeTool
 * registrations feed agent-runtime execution.
 */
export type RuntimeToolConfig = {
  readonly executors?: readonly AgentExecutor[];
  readonly enableMockWebSearch?: boolean;
  readonly runtimeTools?: readonly RuntimeTool[];
  readonly toolCapabilities?: readonly ToolCapability[];
  readonly hostCommands?: readonly HostCommandCapability[];
  readonly approvalPolicies?: readonly ApprovalPolicy[];
};

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningSummary = "auto" | "concise" | "detailed";

/**
 * Fully composed dependency graph consumed by HTTP routes.
 *
 * Routes receive ready ports and safe labels, not config objects, database
 * URLs, provider credentials, or manifest-building details.
 */
export type ServiceComposition = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly memory: MemoryPort;
  readonly ragRetriever: RagRetrieverPort;
  readonly researchAgent: ResearchAgentPort;
  readonly contextManager: ContextManagerPort;
  readonly runtime: AgentRuntime;
  readonly runtimeProviderId: string;
  readonly runtimeModelId: string;
  readonly persistenceLabel: "memory" | "postgres-drizzle";
  readonly capabilities: ServiceCapabilityStatus;
};

/**
 * Inputs for wiring one service instance.
 *
 * Production code should pass explicit adapters for anything that touches real
 * users, data, providers, or policy. Omitted adapters fall back to local/test
 * behavior so the service can still boot in development.
 */
export type ServiceCompositionOptions = {
  readonly workspace: WorkspaceRef;
  readonly auth?: ServiceAuthConfig;
  readonly policies?: ServicePolicyConfig;
  readonly persistence?: PersistenceConfig;
  readonly repositories?: SidechatRepositories;
  readonly runtime?: RuntimeConfig & RuntimeToolConfig;
  readonly agentRuntime?: AgentRuntime;
  /** Capability declarations; concrete memory/RAG/research work still needs the ports below. */
  readonly capabilities?: ServiceCapabilityConfig;
  readonly turnGuards?: TurnGuardRegistryPort;
  readonly turnGuardIds?: readonly string[];
  readonly memory?: MemoryPort;
  readonly memoryPolicy?: MemoryPolicy;
  readonly ragRetriever?: RagRetrieverPort;
  readonly retrievalSources?: readonly RetrievalSourceCapability[];
  readonly researchAgent?: ResearchAgentPort;
  readonly researchAgents?: readonly ResearchAgentCapability[];
};
