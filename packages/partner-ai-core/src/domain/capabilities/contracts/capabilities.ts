import type { JsonObject } from "@side-chat/shared";
import type {
  ActivityRendererId,
  ExecutorId,
  HostAppId,
  ManifestHash,
  ModelId,
  PolicyId,
  ProfileId,
  ProviderId,
  SystemPromptId,
} from "./capability-ids.js";
import type { HostCapabilityValidationCode } from "./capability-validation-codes.js";

export * from "./capability-ids.js";
export * from "./capability-validation-codes.js";

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

/**
 * Portable host capability declarations that core policy can reason about.
 *
 * These types describe what a host app may offer to one embedding surface:
 * profiles, backend tools, host commands, approvals, and renderers. They are
 * registration and policy inputs only; executable tools, database adapters,
 * provider credentials, and browser rendering stay outside this contract.
 *
 * Update this comment when capability ownership changes or when a manifest
 * field starts carrying executable, provider-native, or browser-only detail.
 */

export const HOST_CAPABILITY_SCHEMA_VERSIONS = {
  V1: "sidechat.host-capabilities.v1",
} as const;

export type HostCapabilitySchemaVersion =
  (typeof HOST_CAPABILITY_SCHEMA_VERSIONS)[keyof typeof HOST_CAPABILITY_SCHEMA_VERSIONS];

export const CONTEXT_CANDIDATE_SOURCE_TYPES = {
  CURRENT_MESSAGE: "current_message",
  CONVERSATION_HISTORY: "conversation_history",
  HOST_CONTEXT: "host_context",
  TURN_PROFILE: "turn_profile",
  TOOL_CAPABILITY: "tool_capability",
  TOOL_RESULT: "tool_result",
} as const;

export type ContextCandidateSourceType =
  (typeof CONTEXT_CANDIDATE_SOURCE_TYPES)[keyof typeof CONTEXT_CANDIDATE_SOURCE_TYPES];

export const CONTEXT_TRUST_LEVELS = {
  SYSTEM: "system",
  SERVER_VERIFIED: "server_verified",
  USER_PROVIDED: "user_provided",
  UNTRUSTED_EXTERNAL: "untrusted_external",
  GENERATED: "generated",
} as const;

export type ContextTrustLevel = (typeof CONTEXT_TRUST_LEVELS)[keyof typeof CONTEXT_TRUST_LEVELS];

export const CONTEXT_REDACTION_CLASSES = {
  PUBLIC: "public",
  WORKSPACE_CONFIDENTIAL: "workspace_confidential",
  USER_CONFIDENTIAL: "user_confidential",
  SECRET: "secret",
} as const;

export type ContextRedactionClass =
  (typeof CONTEXT_REDACTION_CLASSES)[keyof typeof CONTEXT_REDACTION_CLASSES];

export const TOOL_POLICY_MODES = {
  CLOSED: "closed",
  PROFILE_ALLOWLIST: "profile_allowlist",
} as const;

export type ToolPolicyMode = ObjectValue<typeof TOOL_POLICY_MODES>;

/**
 * Approval modes are VALIDATED, NOT YET ENFORCED.
 *
 * The manifest, turn-policy, and requirement code fully cross-check approval
 * declarations, but nothing gates a capability on its mode at run time
 * (`createTurnPolicyDecision` selects no commands, and no runtime step consults
 * `approvalRequirements`). Until approval enforcement and the widget approval UI
 * ship, service composition rejects any mode other than `NEVER` rather than
 * silently accepting one — see the approval wall in `create-service-capability-bundle.ts`.
 */
export const APPROVAL_MODES = {
  NEVER: "never",
  ON_REQUEST: "on_request",
  ALWAYS: "always",
} as const;

export type ApprovalMode = ObjectValue<typeof APPROVAL_MODES>;

export const OUTPUT_FORMATS = {
  MARKDOWN: "markdown",
  JSON: "json",
  TEXT: "text",
} as const;

export type OutputFormat = ObjectValue<typeof OUTPUT_FORMATS>;

export type OutputContract = {
  readonly format: OutputFormat;
  readonly schema?: JsonObject | undefined;
};

export type ModelPolicy = {
  readonly providerId: ProviderId;
  /** Default model used when the request does not choose one. */
  readonly modelId: ModelId;
  /** Backend model ids this profile may switch between for a turn. */
  readonly allowedModelIds?: readonly ModelId[] | undefined;
};

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ReasoningPolicy = {
  readonly effort: ReasoningEffort;
};

/**
 * Provider-neutral model call settings a profile applies to its turns.
 *
 * Ordinary sampling/output knobs plus the tool-loop step cap, all optional. Core
 * carries them from the profile into the runtime request; the runtime spreads them
 * into the model call. Mirrors the runtime contract's `RuntimeCallSettings`.
 */
export type CallSettingsPolicy = {
  readonly temperature?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly stopSequences?: readonly string[] | undefined;
  readonly maxToolSteps?: number | undefined;
};

export type ToolExposurePolicy = {
  readonly mode: ToolPolicyMode;
  readonly allowedToolNames: readonly string[];
};

export const PROMPT_INJECTION_MODES = {
  STANDARD: "standard",
  STRICT: "strict",
} as const;

export type PromptInjectionMode = ObjectValue<typeof PROMPT_INJECTION_MODES>;

export type SafetyPolicy = {
  readonly policyId: PolicyId;
  readonly promptInjectionMode: PromptInjectionMode;
  readonly turnGuardIds: readonly string[];
};

/**
 * Versioned turn setup registered by a host capability manifest.
 *
 * Core resolves exactly one profile per assistant turn. Provider/model, default
 * tools, output, and safety policy flow from that profile. Request-level model
 * preferences are only honored when backend policy resolves them to a model id
 * listed in `modelPolicy.allowedModelIds`.
 */
export type TurnProfile = {
  readonly profileId: ProfileId;
  readonly version: string;
  readonly displayName: string;
  readonly systemPromptId: SystemPromptId;
  readonly systemInstructions: string;
  readonly executorId: ExecutorId;
  readonly modelPolicy: ModelPolicy;
  readonly callSettings?: CallSettingsPolicy | undefined;
  readonly defaultToolPolicy: ToolExposurePolicy;
  readonly outputContract: OutputContract;
  readonly safetyPolicy: SafetyPolicy;
};

/**
 * Manifest declaration for a backend capability the host app can offer.
 *
 * This is not executable code. A matching RuntimeTool must still be registered
 * in agent-runtime, and a TurnPolicyDecision must allow the name for the turn.
 */
export type ToolCapability = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

/**
 * Manifest declaration for a host-app UI command.
 *
 * Commands are browser/host interactions, not backend runtime tools, unless the
 * service separately models a backend tool that asks for or records approval.
 */
export type HostCommandCapability = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly approvalMode: ApprovalMode;
};

/** Validated, not yet enforced — see the {@link APPROVAL_MODES} contract note. */
export type ApprovalPolicy = {
  readonly policyId: PolicyId;
  readonly mode: ApprovalMode;
  readonly capabilityNames: readonly string[];
};

export type ActivityRendererCapability = {
  readonly rendererId: ActivityRendererId;
  readonly activityKind: string;
};

/**
 * Host-declared capability catalog for one embedding surface.
 *
 * The manifest is the authority for profiles, tools, commands, approvals, and
 * renderers available to core policy. A capability being present here is
 * registration only; exposure is decided by `TurnPolicyDecision` for each turn.
 */
export type HostCapabilityManifest = {
  readonly schemaVersion: string;
  readonly hostAppId: HostAppId;
  readonly defaultTurnProfileId: ProfileId;
  readonly turnProfiles: readonly TurnProfile[];
  readonly tools: readonly ToolCapability[];
  readonly commands: readonly HostCommandCapability[];
  readonly approvalPolicies: readonly ApprovalPolicy[];
  readonly activityRenderers: readonly ActivityRendererCapability[];
};

export type HostCapabilityValidationIssue = {
  readonly code: HostCapabilityValidationCode;
  readonly path: string;
  readonly message: string;
};

export type HostCapabilityValidationResult =
  | { readonly valid: true; readonly manifest: HostCapabilityManifest }
  | { readonly valid: false; readonly issues: readonly HostCapabilityValidationIssue[] };

export type TurnPolicyValidationResult =
  | { readonly valid: true; readonly decision: TurnPolicyDecision }
  | { readonly valid: false; readonly issues: readonly HostCapabilityValidationIssue[] };

export type TurnProfileResolution =
  | { readonly resolved: true; readonly profile: TurnProfile }
  | { readonly resolved: false; readonly issue: HostCapabilityValidationIssue };

export type ApprovalRequirement = {
  readonly capabilityName: string;
  readonly mode: ApprovalMode;
};

/**
 * Per-turn authorization result for runtime execution.
 *
 * This object is persisted and revalidated before runtime execution. It must
 * reference only capabilities from the manifest/profile pair used to create it,
 * so the runtime receives a closed allowlist rather than rediscovering tools.
 */
export type TurnPolicyDecision = {
  readonly profileId: ProfileId;
  readonly profileVersion: string;
  readonly systemInstructions: string;
  readonly executorId: ExecutorId;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly reasoning?: ReasoningPolicy | undefined;
  readonly callSettings?: CallSettingsPolicy | undefined;
  readonly allowedToolNames: readonly string[];
  readonly allowedCommandNames: readonly string[];
  readonly approvalRequirements: readonly ApprovalRequirement[];
  readonly manifestHash: ManifestHash;
};

export type TurnPolicyResolutionInput = {
  readonly manifest: HostCapabilityManifest;
  readonly profile: TurnProfile;
  readonly manifestHash: ManifestHash;
  readonly modelSelection?: ModelPolicy & { readonly reasoning?: ReasoningPolicy | undefined };
};
