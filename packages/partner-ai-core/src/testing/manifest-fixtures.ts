import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  type TurnProfile,
  type HostCapabilityManifest,
} from "#domain/capabilities-contract";

type ValidationWithIssueCodes =
  | { readonly valid: true }
  | { readonly valid: false; readonly issues: readonly { readonly code: string }[] };

export const createManifest = (
  overrides: Partial<HostCapabilityManifest> = {},
): HostCapabilityManifest => {
  const analyst = createTurnProfile();

  return {
    schemaVersion: HOST_CAPABILITY_SCHEMA_VERSIONS.V1,
    hostAppId: "host_app_001",
    defaultTurnProfileId: analyst.profileId,
    turnProfiles: [analyst],
    tools: [createTool("mock_web_search")],
    commands: [createHostCommand("open_record")],
    ...overrides,
  };
};

export const createTurnProfile = (overrides: Partial<TurnProfile> = {}): TurnProfile => ({
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
  outputContract: { format: "markdown" },
  safetyPolicy: { policyId: "standard", promptInjectionMode: "standard", turnGuardIds: [] },
  ...overrides,
});

export const createTool = (name: string) => ({
  name,
  description: `${name} test capability.`,
  inputSchema: { type: "object" },
});

export const issueCodes = (validation: ValidationWithIssueCodes): readonly string[] =>
  validation.valid ? [] : validation.issues.map((issue) => issue.code);

export const turnPolicyIssueCodes = (validation: ValidationWithIssueCodes): readonly string[] =>
  validation.valid ? [] : validation.issues.map((issue) => issue.code);

const createHostCommand = (commandName: string) => ({
  commandName,
  description: "Open a host app record for the user.",
  inputSchema: { type: "object" },
});
