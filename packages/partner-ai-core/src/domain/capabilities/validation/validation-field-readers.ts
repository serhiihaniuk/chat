import type {
  ApprovalPolicy,
  TurnProfile,
  HostCommandCapability,
  ToolCapability,
} from "../contracts/capabilities.js";

export const readTurnProfileId = (profile: TurnProfile): string => profile.profileId;

export const readToolCapabilityName = (tool: ToolCapability): string => tool.name;

export const readHostCommandName = (command: HostCommandCapability): string => command.commandName;

export const readApprovalPolicyId = (policy: ApprovalPolicy): string => policy.policyId;
