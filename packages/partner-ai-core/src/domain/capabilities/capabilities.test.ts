import { describe, expect, it } from "vitest";
import {
  HOST_CAPABILITY_VALIDATION_CODES,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  validateHostCapabilityManifest,
  validateTurnPolicyDecision,
} from "../capabilities.js";
import {
  createAssistantProfile,
  createManifest,
  createTool,
  createWorkflow,
  issueCodes,
} from "#testing/capabilities/manifest-fixtures";

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
      systemInstructions: "Use concise analyst language.",
      executorId: "ai_sdk.tool_loop",
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
