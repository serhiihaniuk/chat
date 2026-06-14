import type {
  ApprovalPolicy,
  AssistantProfile,
  HostCommandCapability,
  MemoryPolicy,
  RetrievalSourceCapability,
  ToolCapability,
  WorkflowCapability,
} from "../contracts/capabilities.js";

export const readAssistantProfileId = (profile: AssistantProfile): string => profile.profileId;

export const readToolCapabilityName = (tool: ToolCapability): string => tool.name;

export const readHostCommandName = (command: HostCommandCapability): string => command.commandName;

export const readWorkflowId = (workflow: WorkflowCapability): string => workflow.workflowId;

export const readApprovalPolicyId = (policy: ApprovalPolicy): string => policy.policyId;

export const readMemoryPolicyId = (policy: MemoryPolicy): string => policy.policyId;

export const readRetrievalSourceId = (source: RetrievalSourceCapability): string => source.sourceId;
