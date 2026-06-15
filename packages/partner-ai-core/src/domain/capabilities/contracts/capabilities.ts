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
} from "./ids/capability-ids.js";
import type { HostCapabilityValidationCode } from "./validation/capability-validation-codes.js";

export * from "./ids/capability-ids.js";
export * from "./validation/capability-validation-codes.js";

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
  CONVERSATION_SUMMARY: "conversation_summary",
  HOST_CONTEXT: "host_context",
  ASSISTANT_PROFILE: "assistant_profile",
  TOOL_CAPABILITY: "tool_capability",
  TOOL_RESULT: "tool_result",
} as const;

export type ContextCandidateSourceType =
  (typeof CONTEXT_CANDIDATE_SOURCE_TYPES)[keyof typeof CONTEXT_CANDIDATE_SOURCE_TYPES];

export const CONTEXT_TRUST_LEVELS = {
  SYSTEM: "system",
  TRUSTED_HOST: "trusted_host",
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

export type ToolPolicyMode = "closed" | "profile_allowlist";

export type ApprovalMode = "never" | "on_request" | "always";

export type OutputContract = {
  readonly format: "markdown" | "json" | "text";
  readonly schema?: JsonObject | undefined;
};

export type ModelPolicy = {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
};

export type ToolExposurePolicy = {
  readonly mode: ToolPolicyMode;
  readonly allowedToolNames: readonly string[];
};

export type SafetyPolicy = {
  readonly policyId: PolicyId;
  readonly promptInjectionMode: "standard" | "strict";
  readonly turnGuardIds: readonly string[];
};

/**
 * Versioned assistant policy registered by a host capability manifest.
 *
 * Core resolves exactly one profile per assistant turn. Provider/model, default
 * tools, output, and safety policy flow from that profile; callers must not
 * treat request-level model ids as a second selection path.
 */
export type AssistantProfile = {
  readonly profileId: ProfileId;
  readonly version: string;
  readonly displayName: string;
  readonly systemPromptId: SystemPromptId;
  readonly systemInstructions: string;
  readonly executorId: ExecutorId;
  readonly modelPolicy: ModelPolicy;
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
  readonly defaultAssistantProfileId: ProfileId;
  readonly assistantProfiles: readonly AssistantProfile[];
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

export type AssistantProfileResolution =
  | { readonly resolved: true; readonly profile: AssistantProfile }
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
  readonly allowedToolNames: readonly string[];
  readonly allowedCommandNames: readonly string[];
  readonly approvalRequirements: readonly ApprovalRequirement[];
  readonly manifestHash: ManifestHash;
};

export type TurnPolicyResolutionInput = {
  readonly manifest: HostCapabilityManifest;
  readonly profile: AssistantProfile;
  readonly manifestHash: ManifestHash;
};
