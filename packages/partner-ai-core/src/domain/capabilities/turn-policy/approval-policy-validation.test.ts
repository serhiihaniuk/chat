import { describe, expect, it } from "vitest";
import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  HOST_CAPABILITY_VALIDATION_CODES,
  createTurnPolicyDecision,
  hashHostCapabilityManifest,
  validateHostCapabilityManifest,
  validateTurnPolicyDecision,
  type TurnProfile,
  type HostCapabilityManifest,
  type TurnPolicyDecision,
} from "../../capabilities.js";

describe("host capability approval policy validation", () => {
  it("accepts approval policies for declared tools and host commands", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        tools: [createTool("jira.search_issues"), createTool("jira.create_issue")],
        commands: [createHostCommand("host.open_ticket_panel")],
        approvalPolicies: [
          createApprovalPolicy("sensitive_capabilities_require_approval", [
            "jira.create_issue",
            "host.open_ticket_panel",
          ]),
        ],
      }),
    );

    expect(validation.valid).toBe(true);
  });

  it("fails closed on duplicate host command names", () => {
    const openTicketPanel = createHostCommand("host.open_ticket_panel");
    const validation = validateHostCapabilityManifest(
      createManifest({
        commands: [openTicketPanel, openTicketPanel],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_COMMAND_NAME,
    );
  });

  it("fails closed on duplicate approval policy ids", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        approvalPolicies: [
          createApprovalPolicy("host_commands_require_review", ["host.open_ticket_panel"]),
          createApprovalPolicy("host_commands_require_review", ["host.open_ticket_panel"]),
        ],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_APPROVAL_POLICY_ID,
    );
  });

  it("fails closed when approval policies reference undeclared capabilities", () => {
    const validation = validateHostCapabilityManifest(
      createManifest({
        approvalPolicies: [createApprovalPolicy("review_missing_capability", ["missing"])],
      }),
    );

    expect(issueCodes(validation)).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_APPROVAL_REFERENCE,
    );
  });
});

describe("turn policy approval requirements", () => {
  it("adds approval only for selected capabilities", () => {
    const profile = createTurnProfile({ allowedToolNames: ["jira.create_issue"] });
    const manifest = createManifest({
      turnProfiles: [profile],
      tools: [createTool("jira.search_issues"), createTool("jira.create_issue")],
      approvalPolicies: [
        createApprovalPolicy("jira_create_issue_requires_approval", ["jira.create_issue"]),
        createApprovalPolicy("host_command_requires_approval", ["host.open_ticket_panel"]),
      ],
    });

    const decision = createDecision(manifest, profile);

    expect(decision.approvalRequirements).toEqual([
      { capabilityName: "jira.create_issue", mode: "always" },
    ]);
    expect(validateTurnPolicyDecision(manifest, profile, decision)).toMatchObject({ valid: true });
  });

  it("accepts selected host command approval requirements from custom policy resolvers", () => {
    const profile = createTurnProfile({ allowedToolNames: [] });
    const manifest = createManifest({ turnProfiles: [profile] });
    const decision = {
      ...createDecision(manifest, profile),
      allowedCommandNames: ["host.open_ticket_panel"],
      approvalRequirements: [{ capabilityName: "host.open_ticket_panel", mode: "always" }],
    } satisfies TurnPolicyDecision;

    expect(validateTurnPolicyDecision(manifest, profile, decision)).toMatchObject({ valid: true });
  });

  it("fails when selected capabilities are missing required approval", () => {
    const profile = createTurnProfile({ allowedToolNames: ["jira.create_issue"] });
    const manifest = createManifest({
      turnProfiles: [profile],
      tools: [createTool("jira.create_issue")],
      approvalPolicies: [
        createApprovalPolicy("jira_create_issue_requires_approval", ["jira.create_issue"]),
      ],
    });
    const decision = {
      ...createDecision(manifest, profile),
      approvalRequirements: [],
    };

    expect(turnPolicyIssueCodes(validateTurnPolicyDecision(manifest, profile, decision))).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
    );
  });

  it("fails on unknown or unselected approval requirements", () => {
    const profile = createTurnProfile({ allowedToolNames: ["jira.search_issues"] });
    const manifest = createManifest({
      turnProfiles: [profile],
      tools: [createTool("jira.search_issues"), createTool("jira.create_issue")],
      approvalPolicies: [
        createApprovalPolicy("jira_create_issue_requires_approval", ["jira.create_issue"]),
      ],
    });
    const decision = {
      ...createDecision(manifest, profile),
      approvalRequirements: [
        { capabilityName: "missing", mode: "always" as const },
        { capabilityName: "jira.create_issue", mode: "always" as const },
      ],
    };

    expect(turnPolicyIssueCodes(validateTurnPolicyDecision(manifest, profile, decision))).toEqual(
      expect.arrayContaining([
        HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_APPROVAL_REFERENCE,
        HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
      ]),
    );
  });

  it("fails when approval requirement mode differs from manifest policy", () => {
    const profile = createTurnProfile({ allowedToolNames: ["jira.create_issue"] });
    const manifest = createManifest({
      turnProfiles: [profile],
      tools: [createTool("jira.create_issue")],
      approvalPolicies: [
        createApprovalPolicy("jira_create_issue_requires_approval", ["jira.create_issue"]),
      ],
    });
    const decision = {
      ...createDecision(manifest, profile),
      approvalRequirements: [{ capabilityName: "jira.create_issue", mode: "on_request" as const }],
    };

    expect(turnPolicyIssueCodes(validateTurnPolicyDecision(manifest, profile, decision))).toContain(
      HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
    );
  });
});

const createManifest = (
  overrides: Partial<HostCapabilityManifest> = {},
): HostCapabilityManifest => {
  const analyst = createTurnProfile();

  return {
    schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
    hostAppId: "host_app_approval_validation",
    defaultTurnProfileId: analyst.profileId,
    turnProfiles: [analyst],
    tools: [createTool("jira.search_issues")],
    commands: [createHostCommand("host.open_ticket_panel")],
    approvalPolicies: [
      createApprovalPolicy("host_commands_require_review", ["host.open_ticket_panel"]),
    ],
    activityRenderers: [],
    ...overrides,
  };
};

const createTurnProfile = ({
  allowedToolNames = ["jira.search_issues"],
}: {
  readonly allowedToolNames?: readonly string[];
} = {}): TurnProfile => ({
  profileId: "analyst",
  version: "2026-06-13",
  displayName: "Analyst",
  systemPromptId: "prompt_analyst_v1",
  systemInstructions: "Use concise analyst language.",
  executorId: "ai_sdk.tool_loop",
  modelPolicy: { providerId: "fake", modelId: "fake-echo" },
  defaultToolPolicy: {
    mode: "profile_allowlist",
    allowedToolNames,
  },
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
});

const createTool = (name: string) => ({
  name,
  description: `${name} capability.`,
  inputSchema: { type: "object" },
});

const createHostCommand = (commandName: string) => ({
  commandName,
  description: "Ask the host app to open a ticket panel.",
  inputSchema: { type: "object" },
  approvalMode: "never" as const,
});

const createApprovalPolicy = (policyId: string, capabilityNames: readonly string[]) => ({
  policyId,
  mode: "always" as const,
  capabilityNames,
});

const issueCodes = (
  validation: ReturnType<typeof validateHostCapabilityManifest>,
): readonly string[] => (validation.valid ? [] : validation.issues.map((issue) => issue.code));

const turnPolicyIssueCodes = (
  validation: ReturnType<typeof validateTurnPolicyDecision>,
): readonly string[] => (validation.valid ? [] : validation.issues.map((issue) => issue.code));

const createDecision = (
  manifest: HostCapabilityManifest,
  profile: TurnProfile,
): TurnPolicyDecision =>
  createTurnPolicyDecision({
    manifest,
    profile,
    manifestHash: hashHostCapabilityManifest(manifest),
  });
