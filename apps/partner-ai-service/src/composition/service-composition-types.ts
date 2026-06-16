import type {
  AgentExecutor,
  AgentRuntime,
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
} from "@side-chat/agent-runtime";
import type {
  ApprovalPolicy,
  ContextManagerPort,
  ConversationTitleGenerationPort,
  HostCapabilityManifestPort,
  HostCommandCapability,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCapabilityStatus } from "#composition/capabilities/capability-status";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";
import type { ServiceProviderRegistryStatus } from "#composition/providers/service-provider-registry";
import type {
  ServiceToolRegistration,
  ServiceToolRegistryStatus,
} from "#composition/tools/service-tool-registry";
import type {
  ServiceAssistantConfig,
  ServiceAssistantProfile,
} from "#composition/assistant/assistant-profile-registry";

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
  | { readonly provider: "fake"; readonly modelId?: string | undefined }
  | {
      readonly provider: "openai";
      readonly apiKey: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
      readonly baseUrl?: string | undefined;
      readonly fetch?: typeof fetch | undefined;
      readonly reasoningEffort?: OpenAIReasoningEffort | undefined;
      readonly reasoningSummary?: OpenAIReasoningSummary | undefined;
    };

/**
 * Runtime capabilities that are app-owned but model-callable only after policy.
 *
 * Each `ServiceToolRegistration` feeds both the host capability manifest and
 * agent-runtime execution, so tool declaration and executable registration come
 * from one source instead of two independent lists.
 */
export type RuntimeToolConfig = {
  readonly executors?: readonly AgentExecutor[] | undefined;
  readonly enableMockWebSearch?: boolean | undefined;
  readonly tools?: readonly ServiceToolRegistration[] | undefined;
  readonly hostCommands?: readonly HostCommandCapability[] | undefined;
  readonly approvalPolicies?: readonly ApprovalPolicy[] | undefined;
};

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
  readonly contextManager: ContextManagerPort;
  readonly runtime: AgentRuntime;
  readonly conversationTitleGeneration: ConversationTitleGenerationPort;
  readonly runtimeProviderId: string;
  readonly runtimeModelId: string;
  readonly providerRegistryStatus: ServiceProviderRegistryStatus;
  readonly toolRegistryStatus: ServiceToolRegistryStatus;
  readonly assistantProfiles: readonly ServiceAssistantProfile[];
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
  readonly auth?: ServiceAuthConfig | undefined;
  readonly policies?: ServicePolicyConfig | undefined;
  readonly persistence?: PersistenceConfig | undefined;
  readonly repositories?: SidechatRepositories | undefined;
  readonly runtime?: (RuntimeConfig & RuntimeToolConfig) | undefined;
  readonly agentRuntime?: AgentRuntime | undefined;
  readonly conversationTitleGeneration?: ConversationTitleGenerationPort | undefined;
  /** Capability declarations for implemented service context behavior. */
  readonly capabilities?: ServiceCapabilityConfig | undefined;
  /** Explicit assistant configuration; defaults to the built-in default assistant. */
  readonly assistants?: readonly ServiceAssistantConfig[] | undefined;
  readonly defaultAssistantProfileId?: string | undefined;
  readonly turnGuards?: TurnGuardRegistryPort | undefined;
  readonly turnGuardIds?: readonly string[] | undefined;
};
