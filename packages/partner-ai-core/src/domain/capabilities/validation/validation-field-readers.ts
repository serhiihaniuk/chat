import type {
  ApprovalPolicy,
  AssistantProfile,
  HostCommandCapability,
  ToolCapability,
} from "../contracts/capabilities.js";

export const readAssistantProfileId = (profile: AssistantProfile): string => profile.profileId;

export const readToolCapabilityName = (tool: ToolCapability): string => tool.name;

export const readHostCommandName = (command: HostCommandCapability): string => command.commandName;

export const readApprovalPolicyId = (policy: ApprovalPolicy): string => policy.policyId;
