import {
  HOST_CAPABILITY_VALIDATION_CODES,
  type AssistantProfile,
  type HostCapabilityManifest,
  type HostCapabilityValidationCode,
  type HostCapabilityValidationIssue,
  type TurnPolicyDecision,
  type TurnPolicyValidationResult,
} from "./capabilities.js";

export const validateTurnPolicyDecision = (
  manifest: HostCapabilityManifest,
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): TurnPolicyValidationResult => {
  const issues: HostCapabilityValidationIssue[] = [
    ...profileIdentityIssues(profile, decision),
    ...manifestToolIssues(manifest, decision),
    ...manifestCommandIssues(manifest, decision),
    ...manifestRetrievalIssues(manifest, decision),
    ...manifestWorkflowIssues(manifest, decision),
    ...profileToolIssues(profile, decision),
    ...profileRetrievalIssues(profile, decision),
  ];

  return issues.length === 0 ? { valid: true, decision } : { valid: false, issues };
};

const profileIdentityIssues = (
  profile: AssistantProfile,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] => [
  ...profileIdIssues(profile, decision),
  ...profileVersionIssues(profile, decision),
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

const manifestToolIssues = (
  manifest: HostCapabilityManifest,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.allowedToolNames,
    toolNameSet(manifest),
    "allowedToolNames",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
    turnPolicyUnknownToolMessage,
  );

const manifestCommandIssues = (
  manifest: HostCapabilityManifest,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.allowedCommandNames,
    commandNameSet(manifest),
    "allowedCommandNames",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_COMMAND_REFERENCE,
    turnPolicyUnknownCommandMessage,
  );

const manifestRetrievalIssues = (
  manifest: HostCapabilityManifest,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.retrievalSourceIds,
    retrievalSourceIdSet(manifest),
    "retrievalSourceIds",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_RETRIEVAL_SOURCE_REFERENCE,
    turnPolicyUnknownRetrievalSourceMessage,
  );

const manifestWorkflowIssues = (
  manifest: HostCapabilityManifest,
  decision: TurnPolicyDecision,
): readonly HostCapabilityValidationIssue[] =>
  unknownValueIssues(
    decision.workflowPolicy.allowedWorkflowIds,
    workflowIdSet(manifest),
    "workflowPolicy.allowedWorkflowIds",
    HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_WORKFLOW_REFERENCE,
    turnPolicyUnknownWorkflowMessage,
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

const toolNameSet = (manifest: HostCapabilityManifest): ReadonlySet<string> =>
  new Set(manifest.tools.map((tool) => tool.name));

const commandNameSet = (manifest: HostCapabilityManifest): ReadonlySet<string> =>
  new Set(manifest.commands.map((command) => command.commandName));

const retrievalSourceIdSet = (manifest: HostCapabilityManifest): ReadonlySet<string> =>
  new Set(manifest.retrievalSources.map((source) => source.sourceId));

const workflowIdSet = (manifest: HostCapabilityManifest): ReadonlySet<string> =>
  new Set(manifest.workflows.map((workflow) => workflow.workflowId));

const turnPolicyUnknownToolMessage = (toolName: string): string =>
  `Turn policy references unknown tool ${toolName}.`;

const turnPolicyUnknownCommandMessage = (commandName: string): string =>
  `Turn policy references unknown host command ${commandName}.`;

const turnPolicyUnknownRetrievalSourceMessage = (sourceId: string): string =>
  `Turn policy references unknown retrieval source ${sourceId}.`;

const turnPolicyUnknownWorkflowMessage = (workflowId: string): string =>
  `Turn policy references unknown workflow ${workflowId}.`;
