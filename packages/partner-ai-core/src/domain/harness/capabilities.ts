import type { JsonObject } from "@side-chat/chat-protocol";

export const HOST_CAPABILITY_SCHEMA_VERSIONS = {
  V1: "sidechat.host-capabilities.v1",
} as const;

export type HostCapabilitySchemaVersion =
  (typeof HOST_CAPABILITY_SCHEMA_VERSIONS)[keyof typeof HOST_CAPABILITY_SCHEMA_VERSIONS];

export const HOST_CAPABILITY_VALIDATION_CODES = {
  UNKNOWN_SCHEMA_VERSION: "unknown_schema_version",
  DUPLICATE_PROFILE_ID: "duplicate_profile_id",
  DUPLICATE_TOOL_NAME: "duplicate_tool_name",
  DUPLICATE_WORKFLOW_ID: "duplicate_workflow_id",
  MISSING_DEFAULT_PROFILE: "missing_default_profile",
  UNKNOWN_PROFILE_REFERENCE: "unknown_profile_reference",
  UNKNOWN_TOOL_REFERENCE: "unknown_tool_reference",
  UNKNOWN_COMMAND_REFERENCE: "unknown_command_reference",
  UNKNOWN_WORKFLOW_REFERENCE: "unknown_workflow_reference",
  UNKNOWN_RETRIEVAL_SOURCE_REFERENCE: "unknown_retrieval_source_reference",
  PROFILE_VERSION_MISMATCH: "profile_version_mismatch",
  PROFILE_MODEL_POLICY_MISMATCH: "profile_model_policy_mismatch",
} as const;

export type HostCapabilityValidationCode =
  (typeof HOST_CAPABILITY_VALIDATION_CODES)[keyof typeof HOST_CAPABILITY_VALIDATION_CODES];

export const CONTEXT_CANDIDATE_SOURCE_TYPES = {
  CURRENT_MESSAGE: "current_message",
  CONVERSATION_HISTORY: "conversation_history",
  CONVERSATION_SUMMARY: "conversation_summary",
  HOST_CONTEXT: "host_context",
  ASSISTANT_PROFILE: "assistant_profile",
  TOOL_CAPABILITY: "tool_capability",
  RETRIEVAL_RESULT: "retrieval_result",
  MEMORY: "memory",
  TOOL_RESULT: "tool_result",
  WORKFLOW_ARTIFACT: "workflow_artifact",
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

export type RetrievalPolicyMode = "disabled" | "profile_sources";

export type MemoryPolicyMode = "disabled" | "read" | "read_write";

export type WorkflowPolicyMode = "disabled" | "manifest_workflows";

export type ApprovalMode = "never" | "on_request" | "always";

export type OutputContract = {
  readonly format: "markdown" | "json" | "text";
  readonly schema?: JsonObject;
};

export type ModelPolicy = {
  readonly providerId: string;
  readonly modelId: string;
};

export type ToolExposurePolicy = {
  readonly mode: ToolPolicyMode;
  readonly allowedToolNames: readonly string[];
};

export type RetrievalPolicy = {
  readonly mode: RetrievalPolicyMode;
  readonly sourceIds: readonly string[];
};

/**
 * Manifest/profile memory exposure policy for one assistant turn.
 *
 * This does not recall or persist memory. It only says whether selected memory
 * scopes may be read or receive write candidates when memory ports exist.
 */
export type MemoryPolicy = {
  readonly policyId: string;
  readonly mode: MemoryPolicyMode;
  readonly scopes: readonly string[];
};

export type SafetyPolicy = {
  readonly policyId: string;
  readonly promptInjectionMode: "standard" | "strict";
};

/**
 * Versioned assistant policy registered by a host capability manifest.
 *
 * Core resolves exactly one profile per assistant turn. Provider/model, default
 * tools, retrieval, memory, output, and safety policy flow from that profile;
 * callers must not treat request-level model ids as a second selection path.
 */
export type AssistantProfile = {
  readonly profileId: string;
  readonly version: string;
  readonly displayName: string;
  readonly systemPromptId: string;
  readonly modelPolicy: ModelPolicy;
  readonly defaultToolPolicy: ToolExposurePolicy;
  readonly retrievalPolicy: RetrievalPolicy;
  readonly memoryPolicy: MemoryPolicy;
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

/**
 * Manifest declaration for a source RAG may search during context preparation.
 *
 * The declaration names a possible source only. Turn policy chooses source ids,
 * and context preparation owns retrieval from the selected sources.
 */
export type RetrievalSourceCapability = {
  readonly sourceId: string;
  readonly description: string;
  readonly trustLevel: ContextTrustLevel;
};

export type WorkflowNodeCapability = {
  readonly nodeId: string;
  readonly profileId: string;
  readonly toolPolicy: ToolExposurePolicy;
};

export type WorkflowCapability = {
  readonly workflowId: string;
  readonly description: string;
  readonly nodes: readonly WorkflowNodeCapability[];
};

export type ApprovalPolicy = {
  readonly policyId: string;
  readonly mode: ApprovalMode;
  readonly capabilityNames: readonly string[];
};

export type ActivityRendererCapability = {
  readonly rendererId: string;
  readonly activityKind: string;
};

/**
 * Host-declared capability catalog for one embedding surface.
 *
 * The manifest is the authority for profiles, tools, commands, retrieval
 * sources, workflows, approvals, and renderers available to core policy. A
 * capability being present here is registration only; exposure is decided by
 * `TurnPolicyDecision` for each turn.
 */
export type HostCapabilityManifest = {
  readonly schemaVersion: string;
  readonly hostAppId: string;
  readonly defaultAssistantProfileId: string;
  readonly assistantProfiles: readonly AssistantProfile[];
  readonly tools: readonly ToolCapability[];
  readonly commands: readonly HostCommandCapability[];
  readonly retrievalSources: readonly RetrievalSourceCapability[];
  readonly workflows: readonly WorkflowCapability[];
  readonly approvalPolicies: readonly ApprovalPolicy[];
  readonly memoryPolicies: readonly MemoryPolicy[];
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

export type MemoryScopeDecision = {
  readonly mode: MemoryPolicyMode;
  readonly scopes: readonly string[];
};

export type WorkflowPolicyDecision = {
  readonly mode: WorkflowPolicyMode;
  readonly allowedWorkflowIds: readonly string[];
};

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
  readonly profileId: string;
  readonly profileVersion: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly allowedToolNames: readonly string[];
  readonly allowedCommandNames: readonly string[];
  readonly retrievalSourceIds: readonly string[];
  readonly memoryScope: MemoryScopeDecision;
  readonly workflowPolicy: WorkflowPolicyDecision;
  readonly approvalRequirements: readonly ApprovalRequirement[];
  readonly manifestHash: string;
};

export type TurnPolicyResolutionInput = {
  readonly manifest: HostCapabilityManifest;
  readonly profile: AssistantProfile;
  readonly manifestHash: string;
};
