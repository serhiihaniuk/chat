import { describe, expect, it } from "vitest";
import {
  CONTEXT_REDACTION_CLASSES,
  CONTEXT_TRUST_LEVELS,
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  HOST_CAPABILITY_VALIDATION_CODES,
  WORKFLOW_RUN_STATUSES,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  validateHostCapabilityManifest,
  validateTurnPolicyDecision,
  type AssistantProfile,
  type HostCapabilityManifest,
  type PreparedTurnContext,
  type WorkflowNode,
  type WorkflowCapability,
  type WorkflowRun,
} from "../harness.js";

describe("host capability manifest contract", () => {
  it("accepts a valid fake manifest, resolves a profile, and produces a turn policy decision", () => {
    const manifest = createManifest();
    const validation = validateHostCapabilityManifest(manifest);

    expect(validation.valid).toBe(true);

    const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
    expect(resolution.resolved).toBe(true);
    if (!resolution.resolved) return;

    const decision = createTurnPolicyDecision({
      manifest,
      profile: resolution.profile,
      manifestHash: hashHostCapabilityManifest(manifest),
    });

    expect(decision).toMatchObject({
      profileId: "analyst",
      profileVersion: "2026-06-13",
      providerId: "fake",
      modelId: "fake-echo",
      allowedToolNames: ["mock_web_search"],
      allowedCommandNames: [],
      retrievalSourceIds: ["docs"],
      memoryScope: { mode: "disabled", scopes: [] },
      workflowPolicy: {
        mode: "manifest_workflows",
        allowedWorkflowIds: ["research_then_answer"],
      },
      approvalRequirements: [],
    });
    expect(decision.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateTurnPolicyDecision(manifest, resolution.profile, decision)).toMatchObject({
      valid: true,
    });
  });

  it("rejects turn policies that expose capabilities outside the resolved profile", () => {
    const manifest = createManifest();
    const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
    if (!resolution.resolved) return;
    const decision = {
      ...createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash: hashHostCapabilityManifest(manifest),
      }),
      allowedToolNames: ["mock_web_search", "missing_tool"],
      modelId: "different-model",
    };

    const validation = validateTurnPolicyDecision(manifest, resolution.profile, decision);

    expect(turnPolicyIssueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MODEL_POLICY_MISMATCH,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    ]);
  });

  it("rejects turn policies that expose manifest-declared tools outside the resolved profile", () => {
    const manifest = createManifest({
      tools: [createTool("mock_web_search"), createTool("admin_lookup")],
    });
    const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
    if (!resolution.resolved) return;
    const decision = {
      ...createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash: hashHostCapabilityManifest(manifest),
      }),
      allowedToolNames: ["mock_web_search", "admin_lookup"],
    };

    const validation = validateTurnPolicyDecision(manifest, resolution.profile, decision);

    expect(turnPolicyIssueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    ]);
  });

  it("rejects turn policies that widen memory outside the resolved profile", () => {
    const analyst = createAssistantProfile({
      memoryPolicy: { policyId: "user_memory", mode: "read", scopes: ["user"] },
    });
    const manifest = createManifest({ assistantProfiles: [analyst] });
    const decision = {
      ...createTurnPolicyDecision({
        manifest,
        profile: analyst,
        manifestHash: hashHostCapabilityManifest(manifest),
      }),
      memoryScope: { mode: "read_write", scopes: ["user", "workspace"] } as const,
    };

    const validation = validateTurnPolicyDecision(manifest, analyst, decision);

    expect(turnPolicyIssueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
    ]);
  });

  it("hashes equivalent manifests deterministically", () => {
    expect(hashHostCapabilityManifest(createManifest())).toBe(
      hashHostCapabilityManifest(createManifest()),
    );
  });

  it("fails closed on unsupported manifest schema versions", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({ schemaVersion: "sidechat.host-capabilities.v999" }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_SCHEMA_VERSION,
    );
  });

  it("fails closed on duplicate tool names", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        tools: [createTool("mock_web_search"), createTool("mock_web_search")],
      }),
    );

    expect(issueCodes(validation)).toContain(HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_TOOL_NAME);
  });

  it("fails closed on duplicate memory policy ids", () => {
    const memoryPolicy = { policyId: "user_memory", mode: "read" as const, scopes: ["user"] };
    const validation = validateHostCapabilityManifest(
      createManifest({
        assistantProfiles: [createAssistantProfile({ memoryPolicy })],
        memoryPolicies: [memoryPolicy, memoryPolicy],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_MEMORY_POLICY_ID,
    );
  });

  it("fails closed when profiles reference missing memory policies", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        assistantProfiles: [
          createAssistantProfile({
            memoryPolicy: { policyId: "user_memory", mode: "read", scopes: ["user"] },
          }),
        ],
        memoryPolicies: [],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_MEMORY_POLICY_REFERENCE,
    );
  });

  it("fails closed when profile memory policy differs from manifest memory policy", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        assistantProfiles: [
          createAssistantProfile({
            memoryPolicy: { policyId: "user_memory", mode: "read_write", scopes: ["user"] },
          }),
        ],
        memoryPolicies: [{ policyId: "user_memory", mode: "read", scopes: ["user"] }],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
    );
  });

  it("fails closed on duplicate workflow ids", () => {
    const workflow = createWorkflow("research_then_answer", "analyst");
    const validation = validateHostCapabilityManifest(
      createManifest({ workflows: [workflow, workflow] }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_WORKFLOW_ID,
    );
  });

  it("fails closed when the default profile id is not registered", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({ defaultAssistantProfileId: "missing_profile" }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.MISSING_DEFAULT_PROFILE,
    );
  });

  it("fails closed when a workflow node references a missing profile", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        workflows: [createWorkflow("research_then_answer", "missing_profile")],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_PROFILE_REFERENCE,
    );
  });

  it("fails closed when profiles or workflow nodes reference missing tools", () => {
    const analyst = createAssistantProfile({
      defaultToolPolicy: {
        mode: "profile_allowlist",
        allowedToolNames: ["missing_tool"],
      },
    });
    const validation = validateHostCapabilityManifest(
      createManifest({
        assistantProfiles: [analyst],
        workflows: [createWorkflow("research_then_answer", "analyst", ["missing_tool"])],
      }),
    );

    expect(issueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    ]);
  });
});

describe("harness substrate types", () => {
  it("models context manifests and workflow ledger records without infrastructure types", () => {
    const prepared = {
      contextId: "context_001",
      profile: createAssistantProfile(),
      policyDecision: createTurnPolicyDecision({
        manifest: createManifest(),
        profile: createAssistantProfile(),
        manifestHash: "sha256:manifest_001",
      }),
      workflowArtifacts: [],
      candidates: [
        {
          candidateId: "candidate_001",
          sourceType: "current_message",
          sourceId: "message_001",
          trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
          redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
          content: "Summarize the attached record.",
          estimatedTokens: 8,
          priority: 100,
          provenance: { sourceId: "message_001", label: "Current user message" },
        },
      ],
      runtimeMessages: [{ role: "user", content: "Summarize the attached record." }],
      contextBoard: {
        sections: [
          {
            title: "Current request",
            content: "Summarize the attached record.",
            priority: 100,
          },
        ],
        manifest: {
          manifestId: "manifest_001",
          manifestHash: "sha256:context_001",
          profileId: "analyst",
          profileVersion: "2026-06-13",
          entries: [
            {
              candidateId: "candidate_001",
              sourceType: "current_message",
              sourceId: "message_001",
              trustLevel: CONTEXT_TRUST_LEVELS.USER_PROVIDED,
              redactionClass: CONTEXT_REDACTION_CLASSES.USER_CONFIDENTIAL,
              estimatedTokens: 8,
              included: true,
            },
          ],
          budget: {
            maxInputTokens: 4096,
            reservedOutputTokens: 512,
            includedCandidateIds: ["candidate_001"],
            droppedCandidateIds: [],
          },
          createdAt: "2026-06-13T12:00:00.000Z",
        },
      },
    } satisfies PreparedTurnContext;
    const run = {
      workflowRunId: "workflow_run_001",
      workflowId: "research_then_answer",
      conversationId: "conversation_001",
      status: WORKFLOW_RUN_STATUSES.RUNNING,
      startedAt: "2026-06-13T12:00:00.000Z",
    } satisfies WorkflowRun;
    const node = {
      workflowRunId: run.workflowRunId,
      nodeId: "research",
      profileId: prepared.profile.profileId,
      status: "pending",
      parentNodeIds: [],
    } satisfies WorkflowNode;

    expect(prepared.contextBoard.manifest.entries).toHaveLength(1);
    expect(run.status).toBe(WORKFLOW_RUN_STATUSES.RUNNING);
    expect(node.profileId).toBe("analyst");
  });
});

const createManifest = (
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

const createAssistantProfile = (overrides: Partial<AssistantProfile> = {}): AssistantProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: {
    mode: "profile_allowlist",
    allowedToolNames: ["mock_web_search"],
  },
  retrievalPolicy: { mode: "profile_sources", sourceIds: ["docs"] },
  memoryPolicy: { policyId: "no_memory", mode: "disabled", scopes: [] },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard" },
  ...overrides,
});

const createTool = (name: string) => ({
  name,
  description: `${name} test capability.`,
  inputSchema: { type: "object" },
});

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

const createWorkflow = (
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

const issueCodes = (
  validation: ReturnType<typeof validateHostCapabilityManifest>,
): readonly string[] => (validation.valid ? [] : validation.issues.map((issue) => issue.code));

const turnPolicyIssueCodes = (
  validation: ReturnType<typeof validateTurnPolicyDecision>,
): readonly string[] => (validation.valid ? [] : validation.issues.map((issue) => issue.code));
