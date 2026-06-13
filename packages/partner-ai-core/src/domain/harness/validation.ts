import {
  HOST_CAPABILITY_SCHEMA_VERSIONS,
  HOST_CAPABILITY_VALIDATION_CODES,
  type AssistantProfileResolution,
  type HostCapabilityManifest,
  type HostCapabilityValidationCode,
  type HostCapabilityValidationIssue,
  type HostCapabilityValidationResult,
  type TurnPolicyDecision,
  type TurnPolicyResolutionInput,
} from "./capabilities.js";
import { validateMemoryPolicyReferences } from "./turn-policy-memory-validation.js";
import { duplicateValueIssues } from "./validation-issue-helpers.js";

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
      manifest.assistantProfiles.map((profile) => profile.profileId),
      "assistantProfiles",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_PROFILE_ID,
      "assistant profile id",
    ),
    ...duplicateValueIssues(
      manifest.tools.map((tool) => tool.name),
      "tools",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_TOOL_NAME,
      "tool name",
    ),
    ...duplicateValueIssues(
      manifest.workflows.map((workflow) => workflow.workflowId),
      "workflows",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_WORKFLOW_ID,
      "workflow id",
    ),
  );

  const profileIds = new Set(manifest.assistantProfiles.map((profile) => profile.profileId));
  const toolNames = new Set(manifest.tools.map((tool) => tool.name));
  const retrievalSourceIds = new Set(manifest.retrievalSources.map((source) => source.sourceId));

  issues.push(
    ...duplicateValueIssues(
      manifest.memoryPolicies.map((policy) => policy.policyId),
      "memoryPolicies",
      HOST_CAPABILITY_VALIDATION_CODES.DUPLICATE_MEMORY_POLICY_ID,
      "memory policy id",
    ),
    ...validateDefaultProfileReference(manifest, profileIds),
    ...validateAssistantProfileReferences(manifest, toolNames, retrievalSourceIds),
    ...validateMemoryPolicyReferences(manifest),
    ...validateWorkflowReferences(manifest, profileIds, toolNames),
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
}: TurnPolicyResolutionInput): TurnPolicyDecision => ({
  profileId: profile.profileId,
  profileVersion: profile.version,
  providerId: profile.modelPolicy.providerId,
  modelId: profile.modelPolicy.modelId,
  allowedToolNames: profile.defaultToolPolicy.allowedToolNames,
  allowedCommandNames: [],
  retrievalSourceIds: profile.retrievalPolicy.sourceIds,
  memoryScope: {
    mode: profile.memoryPolicy.mode,
    scopes: profile.memoryPolicy.scopes,
  },
  workflowPolicy: {
    mode: "manifest_workflows",
    allowedWorkflowIds: manifest.workflows.map((workflow) => workflow.workflowId),
  },
  approvalRequirements: manifest.approvalPolicies.flatMap((policy) =>
    policy.capabilityNames.map((capabilityName) => ({
      capabilityName,
      mode: policy.mode,
    })),
  ),
  manifestHash,
});

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
  retrievalSourceIds: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  manifest.assistantProfiles.flatMap((profile, profileIndex) => [
    ...unknownValueIssues(
      profile.defaultToolPolicy.allowedToolNames,
      toolNames,
      `assistantProfiles[${profileIndex}].defaultToolPolicy.allowedToolNames`,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
      (toolName) => `Assistant profile ${profile.profileId} references unknown tool ${toolName}.`,
    ),
    ...unknownValueIssues(
      profile.retrievalPolicy.sourceIds,
      retrievalSourceIds,
      `assistantProfiles[${profileIndex}].retrievalPolicy.sourceIds`,
      HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_RETRIEVAL_SOURCE_REFERENCE,
      (sourceId) =>
        `Assistant profile ${profile.profileId} references unknown retrieval source ${sourceId}.`,
    ),
  ]);

const validateWorkflowReferences = (
  manifest: HostCapabilityManifest,
  profileIds: ReadonlySet<string>,
  toolNames: ReadonlySet<string>,
): readonly HostCapabilityValidationIssue[] =>
  manifest.workflows.flatMap((workflow, workflowIndex) =>
    workflow.nodes.flatMap((node, nodeIndex) => [
      ...unknownValueIssues(
        [node.profileId],
        profileIds,
        `workflows[${workflowIndex}].nodes[${nodeIndex}].profileId`,
        HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_PROFILE_REFERENCE,
        (profileId) => `Workflow ${workflow.workflowId} references unknown profile ${profileId}.`,
      ),
      ...unknownValueIssues(
        node.toolPolicy.allowedToolNames,
        toolNames,
        `workflows[${workflowIndex}].nodes[${nodeIndex}].toolPolicy.allowedToolNames`,
        HOST_CAPABILITY_VALIDATION_CODES.UNKNOWN_TOOL_REFERENCE,
        (toolName) =>
          `Workflow ${workflow.workflowId} node ${node.nodeId} references unknown tool ${toolName}.`,
      ),
    ]),
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
