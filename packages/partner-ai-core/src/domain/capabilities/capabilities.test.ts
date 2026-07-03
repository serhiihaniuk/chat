import { describe, expect, it } from "vitest";
import {
  HOST_CAPABILITY_VALIDATION_CODES,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  resolveTurnProfileFromManifest,
  validateHostCapabilityManifest,
  validateTurnPolicyDecision,
} from "../capabilities.js";
import { PARTNER_AI_CORE_ERROR_CODES, configurationInvalidError } from "#errors";
import {
  createTurnProfile,
  createManifest,
  createTool,
  issueCodes,
} from "#testing/capabilities/manifest-fixtures";

describe("host capability manifest contract", () => {
  it("accepts a valid fake manifest, resolves a profile, and produces a turn policy decision", () => {
    const manifest = createManifest();
    const validation = validateHostCapabilityManifest(manifest);

    expect(validation.valid).toBe(true);

    const resolution = resolveTurnProfileFromManifest(manifest, "analyst");
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

  it("fails closed when the default profile id is not registered", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({ defaultTurnProfileId: "missing_profile" }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.MISSING_DEFAULT_PROFILE,
    );
  });

  it("fails closed when profiles reference missing tools", () => {
    const analyst = createTurnProfile({
      defaultToolPolicy: {
        mode: "profile_allowlist",
        allowedToolNames: ["missing_tool"],
      },
    });
    const validation = validateHostCapabilityManifest(
      createManifest({
        turnProfiles: [analyst],
      }),
    );

    expect(issueCodes(validation)).toEqual([
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    ]);
  });

  it("surfaces a typo'd tool reference as configuration_invalid with the issue path", () => {
    const analyst = createTurnProfile({
      defaultToolPolicy: {
        mode: "profile_allowlist",
        allowedToolNames: ["typo_web_search"],
      },
    });
    const validation = validateHostCapabilityManifest(createManifest({ turnProfiles: [analyst] }));
    expect(validation.valid).toBe(false);
    if (validation.valid) return;

    const error = configurationInvalidError(validation.issues);

    // Distinct backend code — a config typo is no longer the generic bucket that
    // a provider crash also lands in.
    expect(error.code).toBe(PARTNER_AI_CORE_ERROR_CODES.CONFIGURATION_INVALID);
    expect(error.code).not.toBe("runtime_failed");
    // The offending field path and issue code survive, not flattened to a string.
    const toolIssue = error.issues?.find((issue) => issue.path.includes("allowedToolNames"));
    expect(toolIssue?.code).toBe(HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE);
    expect(toolIssue?.path).toContain("turnProfiles[0].defaultToolPolicy.allowedToolNames");
  });
});
