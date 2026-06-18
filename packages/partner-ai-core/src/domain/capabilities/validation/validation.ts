import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  HOST_CAPABILITY_VALIDATION_CODES,
  type AssistantProfileResolution,
  type HostCapabilityManifest,
  type HostCapabilityValidationIssue,
  type HostCapabilityValidationResult,
  type TurnPolicyDecision,
  type TurnPolicyResolutionInput,
} from "../contracts/capabilities.js";
import {
  approvalRequirementsForSelectedCapabilities,
  validateApprovalPolicyReferences,
} from "../turn-policy/turn-policy-approval-validation.js";
import {
  readApprovalPolicyId,
  readAssistantProfileId,
  readHostCommandName,
  readToolCapabilityName,
} from "./validation-field-readers.js";
import { duplicateValueIssues, unknownValueIssues } from "./validation-issue-helpers.js";

export const validateHostCapabilityManifest = (
  manifest: HostCapabilityManifest,
): HostCapabilityValidationResult => {
  const issues: HostCapabilityValidationIssue[] = [];

  if (manifest.schemaVersion !== HOST_CAPABILITY_SCHEMA_VERSIONS.V1) {
    issues.push({
      code: HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_SCHEMA_VERSION,
      path: "schemaVersion",
      message: `Unsupported host capability manifest schema ${manifest.schemaVersion}.`,
    });
  }

  issues.push(
    ...duplicateValueIssues(
      manifest.assistantProfiles.map(readAssistantProfileId),
      "assistantProfiles",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_PROFILE_ID,
      "assistant profile id",
    ),
    ...duplicateValueIssues(
      manifest.tools.map(readToolCapabilityName),
      "tools",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_TOOL_NAME,
      "tool name",
    ),
    ...duplicateValueIssues(
      manifest.commands.map(readHostCommandName),
      "commands",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_COMMAND_NAME,
      "host command name",
    ),
    ...duplicateValueIssues(
      manifest.approvalPolicies.map(readApprovalPolicyId),
      "approvalPolicies",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_APPROVAL_POLICY_ID,
      "approval policy id",
    ),
  );

  const profileIds = new Set(manifest.assistantProfiles.map(readAssistantProfileId));
  const toolNames = new Set(manifest.tools.map(readToolCapabilityName));
  const commandNames = new Set(manifest.commands.map(readHostCommandName));

  issues.push(
    ...validateDefaultProfileReference(manifest, profileIds),
    ...validateAssistantProfileReferences(manifest, toolNames),
    ...validateApprovalPolicyReferences(manifest, toolNames, commandNames),
  );

  return issues.length === 0 ? { valid: true, manifest } : { valid: false, issues };
};

export const resolveAssistantProfileFromManifest = (
  manifest: HostCapabilityManifest,
  requestedProfileId: string | undefined = manifest.defaultAssistantProfileId,
): AssistantProfileResolution => {
  const profile = manifest.assistantProfiles.find(
    (candidate) => candidate.profileId === requestedProfileId,
  );
  if (profile) return { resolved: true, profile };

  return {
    resolved: false,
    issue: {
      code: HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_PROFILE_REFERENCE,
      path: "assistantProfileId",
      message: `Assistant profile ${requestedProfileId} is not registered.`,
    },
  };
};

export const createTurnPolicyDecision = ({
  manifest,
  profile,
  manifestHash,
  modelSelection,
}: TurnPolicyResolutionInput): TurnPolicyDecision => {
  // Host commands are registered in the manifest but are not selected for a
  // turn here yet. When command execution is wired, this is the place that must
  // choose which command names the turn may use.
  const allowedCommandNames: readonly string[] = [];
  const selectedCapabilityNames = new Set([
    ...profile.defaultToolPolicy.allowedToolNames,
    ...allowedCommandNames,
  ]);

  return {
    profileId: profile.profileId,
    profileVersion: profile.version,
    systemInstructions: profile.systemInstructions,
    executorId: profile.executorId,
    providerId: modelSelection?.providerId ?? profile.modelPolicy.providerId,
    modelId: modelSelection?.modelId ?? profile.modelPolicy.modelId,
    reasoning: modelSelection?.reasoning,
    allowedToolNames: profile.defaultToolPolicy.allowedToolNames,
    allowedCommandNames,
    approvalRequirements: approvalRequirementsForSelectedCapabilities(
      manifest,
      selectedCapabilityNames,
    ),
    manifestHash,
  };
};

const validateDefaultProfileReference = (
  manifest: HostCapabilityManifest,
  profileIds: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  profileIds.has(manifest.defaultAssistantProfileId)
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.MISSING_DEFAULT_PROFILE,
          path: "defaultAssistantProfileId",
          message: `Default assistant profile ${manifest.defaultAssistantProfileId} is not registered.`,
        },
      ];

const validateAssistantProfileReferences = (
  manifest: HostCapabilityManifest,
  toolNames: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  manifest.assistantProfiles.flatMap((profile, profileIndex) =>
    unknownValueIssues(
      profile.defaultToolPolicy.allowedToolNames,
      toolNames,
      `assistantProfiles[${profileIndex}].defaultToolPolicy.allowedToolNames`,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
      (toolName) => `Assistant profile ${profile.profileId} references unknown tool ${toolName}.`,
    ),
  );
