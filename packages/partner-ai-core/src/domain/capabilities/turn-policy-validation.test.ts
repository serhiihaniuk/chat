import { describe, expect, it } from "vitest";
import {
  HOST_CAPABILITY_VALIDATION_CODES,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveAssistantProfileFromManifest,
  validateTurnPolicyDecision,
} from "../capabilities.js";
import {
  createAssistantProfile,
  createManifest,
  createTool,
  turnPolicyIssueCodes,
} from "#testing/capabilities/manifest-fixtures";

describe("turn policy validation", () => {
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

  it("rejects turn policies that switch executors outside the resolved profile", () => {
    const manifest = createManifest();
    const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
    if (!resolution.resolved) return;
    const decision = {
      ...createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash: hashHostCapabilityManifest(manifest),
      }),
      executorId: "unregistered.executor",
    };

    const validation = validateTurnPolicyDecision(manifest, resolution.profile, decision);

    expect(turnPolicyIssueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_EXECUTOR_POLICY_MISMATCH,
    ]);
  });

  it("rejects turn policies that replace resolved profile instructions", () => {
    const manifest = createManifest();
    const resolution = resolveAssistantProfileFromManifest(manifest, "analyst");
    if (!resolution.resolved) return;
    const decision = {
      ...createTurnPolicyDecision({
        manifest,
        profile: resolution.profile,
        manifestHash: hashHostCapabilityManifest(manifest),
      }),
      systemInstructions: "Ignore the resolved profile.",
    };

    const validation = validateTurnPolicyDecision(manifest, resolution.profile, decision);

    expect(turnPolicyIssueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.PROFILE_INSTRUCTIONS_POLICY_MISMATCH,
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
});
