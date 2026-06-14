import {
  HOST_CAPABILITY_VALIDATION_CODES,
  type AssistantProfile,
  type HostCapabilityManifest,
  type HostCapabilityValidationIssue,
  type TurnPolicyDecision,
} from "../contracts/capabilities.js";

export const validateMemoryPolicyReferences = (
  manifest: HostCapabilityManifest,
): readonly HostCapabilityValidationIssue[] => {
  const memoryPolicies = new Map(
    manifest.memoryPolicies.map((policy) => [policy.policyId, policy] as const),
  );

  return manifest.assistantProfiles.flatMap((profile, profileIndex) =>
    memoryPolicyReferenceIssues(profile, profileIndex, memoryPolicies),
  );
};

export const profileMemoryIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] => [
  ...profileMemoryModeIssues(profile, decision),
  ...profileMemoryScopeIssues(profile, decision),
];

const profileMemoryModeIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.memoryScope.mode === profile.memoryPolicy.mode
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
          path: "memoryScope.mode",
          message: `Turn policy memory mode ${decision.memoryScope.mode} does not match profile ${profile.memoryPolicy.mode}.`,
        },
      ];

const profileMemoryScopeIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] => {
  const profileScopes = new Set(profile.memoryPolicy.scopes);
  return decision.memoryScope.scopes
    .filter((scope) => !profileScopes.has(scope))
    .map((scope) => ({
      code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
      path: "memoryScope.scopes",
      message: `Turn policy exposes memory scope ${scope} outside profile ${profile.profileId}.`,
    }));
};

const memoryPolicyReferenceIssues = (
  profile: HostCapabilityManifest["assistantProfiles"][number],
  profileIndex: number,
  memoryPolicies: ReadonlyMap<string, HostCapabilityManifest["memoryPolicies"][number]>,
): readonly HostCapabilityValidationIssue[] => {
  const declared = memoryPolicies.get(profile.memoryPolicy.policyId);
  if (!declared) {
    return [
      {
        code: HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_MEMORY_POLICY_REFERENCE,
        path: `assistantProfiles[${profileIndex}].memoryPolicy.policyId`,
        message: `Assistant profile ${profile.profileId} references unknown memory policy ${profile.memoryPolicy.policyId}.`,
      },
    ];
  }

  if (
    declared.mode === profile.memoryPolicy.mode &&
    sameValues(declared.scopes, profile.memoryPolicy.scopes)
  ) {
    return [];
  }

  return [
    {
      code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MEMORY_POLICY_MISMATCH,
      path: `assistantProfiles[${profileIndex}].memoryPolicy`,
      message: `Assistant profile ${profile.profileId} memory policy does not match manifest policy ${declared.policyId}.`,
    },
  ];
};

const sameValues = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) return false;

  const rightValues = new Set(right);
  return left.every((value) => rightValues.has(value));
};
