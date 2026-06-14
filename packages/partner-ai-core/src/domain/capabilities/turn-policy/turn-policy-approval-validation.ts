import {
  HOST_CAPABILITY_VALIDATION_CODES,
  type ApprovalRequirement,
  type HostCapabilityManifest,
  type HostCapabilityValidationIssue,
  type TurnPolicyDecision,
} from "../contracts/capabilities.js";
import {
  readHostCommandName,
  readToolCapabilityName,
} from "../validation/validation-field-readers.js";
import { unknownValueIssues } from "../validation/validation-issue-helpers.js";

export const approvalRequirementsForSelectedCapabilities = (
  manifest: HostCapabilityManifest,
  selectedCapabilityNames: ReadonlySet<string>,
): readonly ApprovalRequirement[] =>
  manifest.approvalPolicies.flatMap((policy) =>
    policy.capabilityNames
      .filter((capabilityName) => selectedCapabilityNames.has(capabilityName))
      .map((capabilityName) => ({
        capabilityName,
        mode: policy.mode,
      })),
  );

export const validateApprovalPolicyReferences = (
  manifest: HostCapabilityManifest,
  toolNames: ReadonlySet<string>,
  commandNames: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] => {
  const approvableNames = new Set([...toolNames, ...commandNames]);

  return manifest.approvalPolicies.flatMap((policy, policyIndex) =>
    unknownValueIssues(
      policy.capabilityNames,
      approvableNames,
      `approvalPolicies[${policyIndex}].capabilityNames`,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_APPROVAL_REFERENCE,
      (capabilityName) =>
        `Approval policy ${policy.policyId} references unknown capability ${capabilityName}.`,
    ),
  );
};

export const approvalRequirementIssues = (
  manifest: HostCapabilityManifest,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] => {
  const selectedCapabilityNames = selectedTurnCapabilityNames(decision);
  const declaredCapabilityNames = declaredApprovableCapabilityNames(manifest);
  const expectedRequirements = approvalRequirementsForSelectedCapabilities(
    manifest,
    selectedCapabilityNames,
  );
  const expectedKeys = approvalRequirementKeySet(expectedRequirements);
  const actualKeys = approvalRequirementKeySet(decision.approvalRequirements);

  return [
    ...unexpectedApprovalRequirementIssues(
      decision,
      declaredCapabilityNames,
      selectedCapabilityNames,
      expectedKeys,
    ),
    ...missingApprovalRequirementIssues(expectedRequirements, actualKeys),
  ];
};

const selectedTurnCapabilityNames = (decision: TurnPolicyDecision): ReadonlySet<string> =>
  new Set([...decision.allowedToolNames, ...decision.allowedCommandNames]);

const declaredApprovableCapabilityNames = (manifest: HostCapabilityManifest): ReadonlySet<string> =>
  new Set([
    ...manifest.tools.map(readToolCapabilityName),
    ...manifest.commands.map(readHostCommandName),
  ]);

const approvalRequirementKeySet = (
  requirements: readonly ApprovalRequirement[],
): ReadonlySet<string> => new Set(requirements.map(approvalRequirementKey));

const unexpectedApprovalRequirementIssues = (
  decision: TurnPolicyDecision,
  declaredCapabilityNames: ReadonlySet<string>,
  selectedCapabilityNames: ReadonlySet<string>,
  expectedKeys: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  decision.approvalRequirements.flatMap((requirement, index) => {
    if (!declaredCapabilityNames.has(requirement.capabilityName)) {
      const issue: HostCapabilityValidationIssue = {
        code: HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_APPROVAL_REFERENCE,
        path: `approvalRequirements[${index}].capabilityName`,
        message: `Turn policy approval references unknown capability ${requirement.capabilityName}.`,
      };
      return [issue];
    }

    if (!selectedCapabilityNames.has(requirement.capabilityName)) {
      const issue: HostCapabilityValidationIssue = {
        code: HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
        path: `approvalRequirements[${index}].capabilityName`,
        message: `Turn policy approval references unselected capability ${requirement.capabilityName}.`,
      };
      return [issue];
    }

    if (!expectedKeys.has(approvalRequirementKey(requirement))) {
      const issue: HostCapabilityValidationIssue = {
        code: HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
        path: `approvalRequirements[${index}].mode`,
        message: `Turn policy approval mode ${requirement.mode} does not match manifest policy for ${requirement.capabilityName}.`,
      };
      return [issue];
    }

    return [];
  });

const missingApprovalRequirementIssues = (
  expectedRequirements: readonly ApprovalRequirement[],
  actualKeys: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  expectedRequirements
    .filter((requirement) => !actualKeys.has(approvalRequirementKey(requirement)))
    .map((requirement) => ({
      code: HOST_CAPABILITY_VALIDATION_CODES.APPROVAL_POLICY_MISMATCH,
      path: "approvalRequirements",
      message: `Turn policy is missing required ${requirement.mode} approval for ${requirement.capabilityName}.`,
    }));

// Use a separator that cannot appear by accident in normal capability names, so
// "tool:a"+"b" and "tool"+"a:b" cannot become the same comparison key.
const approvalRequirementKey = (requirement: ApprovalRequirement): string =>
  `${requirement.capabilityName}\u0000${requirement.mode}`;
