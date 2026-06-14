import {
  HOST_CAPABILITY_VALIDATION_CODES,
  type AssistantProfile,
  type HostCapabilityManifest,
  type HostCapabilityValidationCode,
  type HostCapabilityValidationIssue,
  type TurnPolicyDecision,
  type TurnPolicyValidationResult,
} from "../contracts/capabilities.js";
import { approvalRequirementIssues } from "./turn-policy-approval-validation.js";
import {
  readManifestTurnPolicyReferences,
  unknownManifestCommandMessage,
  unknownManifestRetrievalSourceMessage,
  unknownManifestToolMessage,
  unknownManifestWorkflowMessage,
} from "./turn-policy-manifest-lookups.js";
import { profileMemoryIssues } from "./turn-policy-memory-validation.js";

export const validateTurnPolicyDecision = (
  manifest: HostCapabilityManifest,
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): TurnPolicyValidationResult => {
  const manifestReferences = readManifestTurnPolicyReferences(manifest);
  const issues: HostCapabilityValidationIssue[] = [
    ...profileIdentityIssues(profile, decision),
    ...manifestToolIssues(manifestReferences.toolNames, decision),
    ...manifestCommandIssues(manifestReferences.commandNames, decision),
    ...manifestRetrievalIssues(manifestReferences.retrievalSourceIds, decision),
    ...manifestWorkflowIssues(manifestReferences.workflowIds, decision),
    ...profileToolIssues(profile, decision),
    ...profileRetrievalIssues(profile, decision),
    ...profileMemoryIssues(profile, decision),
    ...approvalRequirementIssues(manifest, decision),
  ];

  return issues.length === 0 ? { valid: true, decision } : { valid: false, issues };
};

const profileIdentityIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] => [
  ...profileIdIssues(profile, decision),
  ...profileVersionIssues(profile, decision),
  ...profileInstructionsIssues(profile, decision),
  ...profileExecutorIssues(profile, decision),
  ...profileModelIssues(profile, decision),
];

const profileIdIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.profileId === profile.profileId
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_PROFILE_REFERENCE,
          path: "profileId",
          message: `Turn policy profile ${decision.profileId} does not match resolved profile ${profile.profileId}.`,
        },
      ];

const profileVersionIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.profileVersion === profile.version
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_VERSION_MISMATCH,
          path: "profileVersion",
          message: `Turn policy profile version ${decision.profileVersion} does not match profile ${profile.profileId}@${profile.version}.`,
        },
      ];

const profileModelIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.providerId === profile.modelPolicy.providerId &&
  decision.modelId === profile.modelPolicy.modelId
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_MODEL_POLICY_MISMATCH,
          path: "modelPolicy",
          message: `Turn policy model ${decision.providerId}/${decision.modelId} does not match profile ${profile.modelPolicy.providerId}/${profile.modelPolicy.modelId}.`,
        },
      ];

const profileInstructionsIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.systemInstructions === profile.systemInstructions
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_INSTRUCTIONS_POLICY_MISMATCH,
          path: "systemInstructions",
          message: `Turn policy instructions do not match profile ${profile.profileId}.`,
        },
      ];

const profileExecutorIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  decision.executorId === profile.executorId
    ? []
    : [
        {
          code: HOST_CAPABILITY_VALIDATION_CODES.PROFILE_EXECUTOR_POLICY_MISMATCH,
          path: "executorId",
          message: `Turn policy executor ${decision.executorId} does not match profile ${profile.profileId} executor ${profile.executorId}.`,
        },
      ];

const manifestToolIssues = (
  toolNames: ReadonlySet<string>,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.allowedToolNames,
    toolNames,
    "allowedToolNames",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    unknownManifestToolMessage,
  );

const manifestCommandIssues = (
  commandNames: ReadonlySet<string>,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.allowedCommandNames,
    commandNames,
    "allowedCommandNames",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_COMMAND_REFERENCE,
    unknownManifestCommandMessage,
  );

const manifestRetrievalIssues = (
  retrievalSourceIds: ReadonlySet<string>,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.retrievalSourceIds,
    retrievalSourceIds,
    "retrievalSourceIds",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_RETRIEVAL_SOURCE_REFERENCE,
    unknownManifestRetrievalSourceMessage,
  );

const manifestWorkflowIssues = (
  workflowIds: ReadonlySet<string>,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.workflowPolicy.allowedWorkflowIds,
    workflowIds,
    "workflowPolicy.allowedWorkflowIds",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_WORKFLOW_REFERENCE,
    unknownManifestWorkflowMessage,
  );

const profileToolIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.allowedToolNames,
    new Set(profile.defaultToolPolicy.allowedToolNames),
    "allowedToolNames",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    (toolName) => `Turn policy exposes tool ${toolName} outside profile ${profile.profileId}.`,
  );

const profileRetrievalIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.retrievalSourceIds,
    new Set(profile.retrievalPolicy.sourceIds),
    "retrievalSourceIds",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_RETRIEVAL_SOURCE_REFERENCE,
    (sourceId) =>
      `Turn policy exposes retrieval source ${sourceId} outside profile ${profile.profileId}.`,
  );

const unknownValueIssues = (
  values: readonly string[],
  knownValues: ReadonlySet<string>,
  path: string,
  code: HostCapabilityValidationCode,
  message: (value: string) => string,
): readonly HostCapabilityValidationIssue[] =>
  values
    .filter((value) => !knownValues.has(value))
    .map((value) => ({
      code,
      path,
      message: message(value),
    }));
