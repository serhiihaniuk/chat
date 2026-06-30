import type { ActivityEvent, ActivityHostCommandDetails } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";

export type HostCommandActivityEvent = ActivityEvent & {
  readonly activityKind: "host_command";
  readonly details: {
    readonly hostCommand: ActivityHostCommandDetails;
  };
};

export type HostCommand = {
  readonly assistantTurnId: string;
  readonly commandId: string;
  readonly commandName: string;
  readonly payload: JsonObject;
};

export type HostCommandCapability = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly resourceTypes?: readonly string[] | undefined;
};

export type HostCapabilities = {
  readonly schemaVersion: string;
  readonly commands: readonly HostCommandCapability[];
};

export const isHostCommandActivityEvent = (
  event: ActivityEvent,
): event is HostCommandActivityEvent =>
  event.activityKind === "host_command" && event.details?.hostCommand !== undefined;

export const toHostCommand = (event: HostCommandActivityEvent): HostCommand => ({
  assistantTurnId: event.assistantTurnId,
  commandId: event.details.hostCommand.commandId,
  commandName: event.details.hostCommand.commandName,
  payload: event.details.hostCommand.payload,
});

export const supportsCommand = (capabilities: HostCapabilities, command: HostCommand): boolean =>
  capabilities.commands.some(
    (capability) =>
      capability.commandName === command.commandName &&
      supportsResourceType(capability, command.payload),
  );

const supportsResourceType = (capability: HostCommandCapability, payload: JsonObject): boolean => {
  const resourceTypes = capability.resourceTypes;
  // No resource list means the command applies to every resource. If a list is
  // present, the command payload must name one allowed resource type.
  if (!resourceTypes || resourceTypes.length === 0) return true;

  const resourceType = payload["resourceType"];
  return typeof resourceType === "string" && resourceTypes.includes(resourceType);
};
