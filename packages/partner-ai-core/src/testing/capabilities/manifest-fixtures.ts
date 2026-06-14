import {
  CONTEXT_TRUST_LEVELS,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  type AssistantProfile,
  type HostCapabilityManifest,
  type WorkflowCapability,
} from "#domain/capabilities";

type ValidationWithIssueCodes =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: readonly { readonly code: string }[] };

export const createManifest = (
  overrides: Partial<HostCapabilityManifest> = {},
): HostCapabilityManifest => {
  const analyst = createAssistantProfile();

  return {
    schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
    hostAppId: "host_app_001",
    defaultAssistantProfileId: analyst.profileId,
    assistantProfiles: [analyst],
    tools: [createTool("mock_web_search")],
    commands: [createHostCommand("open_record")],
    retrievalSources: [
      {
        sourceId: "docs",
        description: "Workspace documentation.",
        trustLevel: CONTEXT_TRUST_LEVELS.TRUSTED_HOST,
      },
    ],
    workflows: [createWorkflow("research_then_answer", analyst.profileId)],
    approvalPolicies: [createApprovalPolicy("host_commands_require_review", ["open_record"])],
    memoryPolicies: [analyst.memoryPolicy],
    activityRenderers: [{ rendererId: "tool_row", activityKind: "tool" }],
    ...overrides,
  };
};

export const createAssistantProfile = (
  overrides: Partial<AssistantProfile> = {},
): AssistantProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  systemInstructions: "Use concise analyst language.",
  executorId: "ai_sdk.tool_loop",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: {
    mode: "profile_allowlist",
    allowedToolNames: ["mock_web_search"],
  },
  retrievalPolicy: { mode: "profile_sources", sourceIds: ["docs"] },
  memoryPolicy: { policyId: "no_memory", mode: "disabled", scopes: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
  ...overrides,
});

export const createTool = (name: string) => ({
  name,
  description: `${name} test capability.`,
  inputSchema: { type: "object" },
});

export const createWorkflow = (
  workflowId: string,
  profileId: string,
  allowedToolNames: readonly string[] = ["mock_web_search"],
): WorkflowCapability => ({
  workflowId,
  description: "Research with one node, then answer.",
  nodes: [
    {
      nodeId: "research",
      profileId,
      toolPolicy: { mode: "profile_allowlist", allowedToolNames },
    },
  ],
});

export const issueCodes = (validation: ValidationWithIssueCodes): readonly string[] =>
  validation.valid ? [] : validation.issues.map((issue) => issue.code);

export const turnPolicyIssueCodes = (validation: ValidationWithIssueCodes): readonly string[] =>
  validation.valid ? [] : validation.issues.map((issue) => issue.code);

const createHostCommand = (commandName: string) => ({
  commandName,
  description: "Open a host app record for the user.",
  inputSchema: { type: "object" },
  approvalMode: "on_request" as const,
});

const createApprovalPolicy = (policyId: string, capabilityNames: readonly string[]) => ({
  policyId,
  mode: "on_request" as const,
  capabilityNames,
});
