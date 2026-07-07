/**
 * Contracts for values a maintainer writes in `sidechat.config.ts`.
 *
 * The source is a checked TypeScript config file; service boot later turns it
 * into `PartnerAiServiceOptions`. Catalog imports carry closed ids, env
 * references point at process env, and secret references stay unresolved here so
 * this file never contains provider credentials or database connection strings.
 */
import type {
  ActivityRendererCapability,
  ApprovalPolicy,
  ConversationTitlePromptConfig,
  HostCommandCapability,
  OutputContract,
  PromptInjectionMode,
  ToolPolicyMode,
} from "@side-chat/partner-ai-core";
import type { RuntimeReasoningEffort } from "@side-chat/ai-runtime-contract";
import type { JsonObject } from "@side-chat/shared";
import type { ServiceCapabilityConfig } from "#composition/capabilities/service-capability-settings";
import type { AUXILIARY_JOBS, AuxiliaryJobMode } from "../catalog/capabilities/auxiliary-jobs.js";
import type { PROVIDERS } from "../catalog/providers.js";
import type {
  RequestPolicyMode,
  ServiceProfileValue,
  ToolDefaultExposure,
} from "../catalog/config-values.js";
import type { SideChatStringEnvReference } from "./env-references.js";
import type {
  SideChatResumabilityConfig,
  SideChatStreamingConfig,
} from "./contracts/resumability-config-types.js";
import type { SideChatEnvironmentConfig } from "./contracts/environment-config-types.js";

export type { SideChatEnvironmentConfig } from "./contracts/environment-config-types.js";

export type { ServiceEnv } from "../env/service-env-contract.js";
export type ServiceProfile = ServiceProfileValue;

export type SideChatModelDescriptor = {
  /** Stable provider-owned model id published by `/models` and sent to runtime. */
  readonly MODEL_ID: string;
  /** Human-readable model name shown in diagnostics and model pickers. */
  readonly DISPLAY_NAME: string;
  /** Optional maximum input context advertised for this model. */
  readonly CONTEXT_WINDOW_TOKENS?: number | undefined;
  /** Optional maximum output budget advertised for this model. */
  readonly MAX_OUTPUT_TOKENS?: number | undefined;
  /** Reasoning effort used when a request does not choose one. */
  readonly DEFAULT_REASONING_EFFORT: RuntimeReasoningEffort;
  /** Reasoning efforts this model can safely expose to the widget. */
  readonly SUPPORTED_REASONING_EFFORTS: readonly RuntimeReasoningEffort[];
};

export type SideChatConfiguredModel<Model extends SideChatModelDescriptor> = {
  /** Imported model descriptor from `PROVIDERS.<PROVIDER>.MODELS`. */
  readonly model: Model;
  /** Per-model thinking/reasoning choices available to the selector. */
  readonly reasoning: {
    /** Reasoning effort selected unless the request explicitly picks another. */
    readonly default: Model["SUPPORTED_REASONING_EFFORTS"][number];
    /** Reasoning efforts the backend allows for this exact model. */
    readonly options: readonly Model["SUPPORTED_REASONING_EFFORTS"][number][];
  };
};

export type SideChatDefaultModel<Model extends SideChatModelDescriptor> = {
  /** Default model for new turns when the browser does not choose one. */
  readonly model: Model;
  /** Default reasoning effort for the default model. */
  readonly reasoning: Model["SUPPORTED_REASONING_EFFORTS"][number];
};

/**
 * OpenAI transport values for the enabled model set.
 *
 * The model list and reasoning choices are safe to publish; these connection
 * values are not. `apiKey` is required only when an OpenAI-backed config is
 * selected. `endpoint` supports compatible gateways or proxies without making a
 * separate dev server or hidden env parser the source of truth.
 */
export type SideChatOpenAIProviderConnectionConfig = {
  readonly kind: typeof PROVIDERS.OPENAI.KIND;
  readonly connection: {
    /** Secret OpenAI-compatible API key read from env at boot. */
    readonly apiKey: SideChatStringEnvReference;
    /** Optional OpenAI-compatible endpoint override such as a gateway URL. */
    readonly endpoint?: SideChatStringEnvReference | undefined;
  };
  readonly reasoning?: {
    /** Provider summary mode for visible reasoning activity; omission keeps summaries hidden. */
    readonly summary?:
      | (typeof PROVIDERS.OPENAI.REASONING_SUMMARIES)[keyof typeof PROVIDERS.OPENAI.REASONING_SUMMARIES]
      | undefined;
  };
};

/**
 * Azure OpenAI transport: a secret `apiKey` plus env-referenced `endpoint`,
 * `apiVersion`, and a per-model `deployment` map keyed by enabled model id.
 */
export type SideChatAzureProviderConnectionConfig = {
  readonly kind: typeof PROVIDERS.AZURE.KIND;
  readonly connection: {
    readonly apiKey: SideChatStringEnvReference;
    readonly endpoint: SideChatStringEnvReference;
    readonly apiVersion: SideChatStringEnvReference;
    readonly deployments: Readonly<Record<string, SideChatStringEnvReference>>;
  };
};

/**
 * Provider connection for the configured model catalog (one provider per config);
 * each provider carries only the connection fields it needs.
 */
export type SideChatModelProviderConfig =
  | { readonly kind: typeof PROVIDERS.FAKE.KIND }
  | SideChatOpenAIProviderConnectionConfig
  | SideChatAzureProviderConnectionConfig;

export type SideChatExecutorDescriptor = {
  /** Stable runtime executor id registered by `agent-runtime`. */
  readonly EXECUTOR_ID: string;
  /** Short label for humans reading the config. */
  readonly LABEL: string;
  /** What this executor does when a turn profile selects it. */
  readonly DESCRIPTION: string;
};

export type SideChatToolDescriptor = {
  /** Stable backend tool name used by the manifest and runtime executable. */
  readonly NAME: string;
  /** Short label for humans reading the config. */
  readonly LABEL: string;
  /** Default model-facing description for this tool. */
  readonly DESCRIPTION: string;
  /** JSON schema accepted by the runtime tool. */
  readonly INPUT_SCHEMA: JsonObject;
};

export type SideChatToolConfig<Tool extends SideChatToolDescriptor = SideChatToolDescriptor> = {
  /** Imported tool descriptor from `TOOLS`. */
  readonly tool: Tool;
  /** Prompt text that teaches the model when this tool is useful. */
  readonly modelPrompt: {
    /** Model-facing usage guidance copied into the tool capability. */
    readonly usageInstructions: string;
  };
  /** Safe runtime parameters for this tool instance. */
  readonly parameters: {
    /** Local delay used by the mock web-search fixture's canned fallback. */
    readonly delayMs?: number | undefined;
    /** How many results the mock web-search sub-agent fabricates. */
    readonly resultCount?: number | undefined;
    /** Model the mock web-search sub-agent runs (defaults to gpt-5.4-mini). */
    readonly searchModelId?: string | undefined;
    /** System prompt that makes the mock web-search sub-agent behave like a search engine. */
    readonly searchAgentPrompt?: string | undefined;
  };
  /** Default exposure and approval metadata for this tool. */
  readonly exposure: {
    /** Whether the default turn profile includes this tool. */
    readonly defaultMode: ToolDefaultExposure;
    /** Approval policy ids that gate this tool, if any. */
    readonly approvalPolicyIds: readonly string[];
  };
};

export type SideChatAuxiliaryModelJobConfig = {
  /** Imported auxiliary job descriptor from `AUXILIARY_JOBS`. */
  readonly job: typeof AUXILIARY_JOBS.CONVERSATION_TITLE;
  /** Whether this auxiliary job is active for this service instance. */
  readonly mode: AuxiliaryJobMode;
  /** Prompt used by the auxiliary model job. */
  readonly prompt: ConversationTitlePromptConfig;
};

export type SideChatTurnProfileDeclaration = {
  /** Stable id requested by `turnProfileId` and published in the manifest. */
  readonly id: string;
  /** Version recorded with the turn profile for policy/audit traceability. */
  readonly version: string;
  /** Human-readable name for diagnostics and future pickers. */
  readonly displayName: string;
  /** Runtime executor selected by this turn profile. */
  readonly executor: SideChatExecutorDescriptor;
  /** Ordered system-prompt sections for normal chat turns. */
  readonly systemInstructions: readonly string[];
  /** Output format contract the model response should satisfy. */
  readonly output: OutputContract;
  /** Backend tools exposed by default when this profile is selected. */
  readonly tools: {
    /** Tool exposure mode, usually closed or profile allowlist. */
    readonly mode: ToolPolicyMode;
    /** Tool names allowed by this profile when mode is an allowlist. */
    readonly names: readonly string[];
  };
  /** Safety and guard policy selected before a turn runs. */
  readonly safety: {
    /** Stable safety policy id from `SAFETY_POLICIES`. */
    readonly policyId: string;
    /** Prompt-injection handling mode for this profile. */
    readonly promptInjectionMode: PromptInjectionMode;
    /** Registered guard ids that must pass for this profile. */
    readonly turnGuardIds: readonly string[];
  };
  /** Optional model call settings applied to this profile's turns; omit for defaults. */
  readonly callSettings?: SideChatCallSettings | undefined;
};

/**
 * Provider-neutral model call settings for a turn profile.
 *
 * Ordinary sampling/output knobs plus the tool-loop step cap, all optional. The
 * boot path passes them through to the runtime, which applies them to the model
 * call; an absent field keeps the runtime/provider default.
 */
export type SideChatCallSettings = {
  readonly temperature?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly stopSequences?: readonly string[] | undefined;
  /** Max tool-loop steps before the turn stops; absent uses the runtime default (20). */
  readonly maxToolSteps?: number | undefined;
};

export type SideChatConfig = {
  /** Process/env inputs visible to config readers but resolved only at boot. */
  readonly environment: SideChatEnvironmentConfig;
  /** Provider-backed models enabled for this service instance. */
  readonly models: {
    /** Provider connection shape used by all enabled models in this config. */
    readonly provider: SideChatModelProviderConfig;
    /** Default model/reasoning selection when the request does not pick one. */
    readonly default: SideChatDefaultModel<SideChatModelDescriptor>;
    /** Complete backend model list published by `/models`. */
    readonly availableModels: readonly SideChatConfiguredModel<SideChatModelDescriptor>[];
  };
  /** Runtime executors that turn profiles are allowed to select. */
  readonly executors: {
    /** Executable runtime strategies available to turn profiles. */
    readonly availableExecutors: readonly SideChatExecutorDescriptor[];
    /** Executor used by the default turn profile. */
    readonly default: SideChatExecutorDescriptor;
  };
  /** Backend runtime tools that can appear in the manifest and execute server-side. */
  readonly tools: {
    /** Configured tool instances, each paired with an implemented executable. */
    readonly availableTools: readonly SideChatToolConfig[];
  };
  /** Browser/host commands, approvals, and activity renderers. */
  readonly hostCommands: {
    /** Host-app commands exposed through the browser bridge, not runtime tools. */
    readonly availableCommands: readonly HostCommandCapability[];
    /** Approval policies that gate tools or host commands. */
    readonly approvalPolicies: readonly ApprovalPolicy[];
    /** UI renderers for command/tool activity. */
    readonly activityRenderers: readonly ActivityRendererCapability[];
  };
  /** Turn guards available for safety policy selection. */
  readonly turnGuards: {
    /** Registered guard descriptors; empty until the service implements guards. */
    readonly availableGuards: readonly never[];
  };
  /** Request-level entitlement policy separate from turn-profile safety. */
  readonly requestPolicy: {
    /** Whether requests are allowed, denied, or checked against configured models. */
    readonly mode: RequestPolicyMode;
    /** Model ids allowed when request policy mode is configured. */
    readonly modelEntitlements: {
      /** Enabled model ids this service may serve for entitled workspaces. */
      readonly modelIds: readonly string[];
    };
  };
  /** Main chat behavior selected before one assistant turn runs. */
  readonly chat: {
    /** Default turn profile declaration for normal chat responses. */
    readonly turnProfile: SideChatTurnProfileDeclaration;
  };
  /** Conversation-history and context-admission budgets. */
  readonly context: ServiceCapabilityConfig;
  /** Model jobs that run outside the main assistant turn. */
  readonly auxiliaryModelJobs: {
    /** Configured auxiliary jobs such as conversation-title generation. */
    readonly availableJobs: readonly SideChatAuxiliaryModelJobConfig[];
  };
  readonly history: {
    /** "full" (default) stores the turn's activity trace (reasoning, tool calls) with the assistant message and serves it on history reads; "disabled" keeps the trace live-stream-only. A data-retention posture, not a UI preference. */
    readonly turnActivity: SideChatStringEnvReference;
  };
  /** Stream-delivery tunables (delta coalescing cadence). */
  readonly streaming: SideChatStreamingConfig;
  /** Operator tunables for crash recovery and resume (lease, heartbeat, reaper). */
  readonly resumability: SideChatResumabilityConfig;
};

/**
 * Preserve literal config values while checking the readable service shape.
 *
 * The config file may contain human-authored prompt text, but closed product
 * ids should arrive from catalog imports. Runtime validation later checks
 * cross-field relationships such as default model membership and tool exposure.
 */
export const defineSideChatConfig = <const Config extends SideChatConfig>(config: Config): Config =>
  config;
