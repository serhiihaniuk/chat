import type {
  AgentExecutor,
  AgentRuntime,
  OpenAIReasoningEffort,
  OpenAIReasoningSummary,
} from "@side-chat/agent-runtime";
import type {
  AiRuntimePort,
  ApprovalPolicy,
  ConversationTitleGenerationPort,
  HostCommandCapability,
  ObservabilitySinkPort,
  StreamChatPorts,
  TurnGuardRegistryPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";
import type { TurnRunner } from "#inbound/turn-runner/turn-runner";
import type { TurnEventDispatcher } from "#inbound/turn-stream/turn-event-dispatcher";
import type { ServiceAuthConfig } from "#adapters/auth/service-auth";
import type { ServicePolicyConfig } from "#adapters/policy/service-policy";
import type { ServiceCapabilityStatus } from "#composition/capabilities/capability-status";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";
import type { ServiceToolRegistration } from "#composition/tools/service-tool-registry";
import type { ServiceTurnProfileConfig } from "#composition/turn-profile/turn-profile-registry";
import type { ServiceDiagnostics } from "./factories/bundle-types.js";

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
 * Operator tunables for resumable streaming, resolved through config (not literals).
 *
 * `safetyPollIntervalMs` is the per-subscriber reconcile cadence: a low-frequency
 * backstop that re-reads the durable log so a missed Postgres `NOTIFY` (or a
 * listener reconnect) still advances a live subscriber. Later resumability steps
 * add lease/heartbeat/reaper tunables to this same section.
 */
export type ResumabilityConfig = {
  readonly safetyPollIntervalMs: number;
};

export type RuntimeModelMetadata = {
  readonly modelId: string;
  readonly displayName: string;
  readonly contextWindowTokens?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
};

/**
 * Runtime provider declaration accepted by service composition.
 *
 * Provider secrets and transport overrides stay private to composition. Core
 * and HTTP routes receive only runtime ids and the prepared AgentRuntime port.
 */
export type RuntimeConfig =
  | {
      readonly provider: "fake";
      readonly modelId?: string | undefined;
      readonly modelMetadata?: readonly RuntimeModelMetadata[] | undefined;
    }
  | {
      readonly provider: "openai";
      readonly apiKey: string;
      readonly modelIds: readonly string[];
      readonly defaultModelId: string;
      readonly modelMetadata?: readonly RuntimeModelMetadata[] | undefined;
      readonly baseUrl?: string | undefined;
      readonly fetch?: typeof fetch | undefined;
      readonly reasoningEffort?: OpenAIReasoningEffort | undefined;
      readonly reasoningEfforts?: readonly OpenAIReasoningEffort[] | undefined;
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
 * URLs, provider credentials, or manifest-building details. The chat-stream
 * route hands `ports` straight to core; health and models read `capabilities`
 * and `diagnostics`. The flat individual ports now live inside `ports`.
 */
export type ServiceComposition = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly auth: ServiceAuthConfig;
  readonly policies: ServicePolicyConfig;
  readonly persistence: PersistenceConfig;
  readonly repositories: SidechatRepositories;
  readonly runtime: AiRuntimePort;
  readonly ports: StreamChatPorts;
  /** Server-owned generation runner that outlives any one HTTP request. */
  readonly turnRunner: TurnRunner;
  /** Per-instance live fan-out of durable turn events to local subscribers. */
  readonly dispatcher: TurnEventDispatcher;
  readonly capabilities: ServiceCapabilityStatus;
  readonly diagnostics: ServiceDiagnostics;
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
  readonly observability?: ObservabilitySinkPort | undefined;
  /** Capability declarations for implemented service context behavior. */
  readonly capabilities?: ServiceCapabilityConfig | undefined;
  /** Explicit turn profile configuration; defaults to the built-in default profile. */
  readonly turnProfiles?: readonly ServiceTurnProfileConfig[] | undefined;
  readonly defaultTurnProfileId?: string | undefined;
  readonly turnGuards?: TurnGuardRegistryPort | undefined;
  readonly turnGuardIds?: readonly string[] | undefined;
  /** Resumable-streaming tunables; defaults to the catalog values when omitted. */
  readonly resumability?: ResumabilityConfig | undefined;
};
