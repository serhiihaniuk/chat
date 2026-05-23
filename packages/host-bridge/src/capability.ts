import type {
  HostCommandEvent,
  JsonObject,
} from "../../chat-protocol/src/index.js";

export type HostCommand = Pick<
  HostCommandEvent,
  "assistantTurnId" | "commandId" | "commandName" | "payload"
>;

export type HostCommandCapability = {
  readonly commandName: string;
  readonly resourceTypes?: readonly string[];
};

export type HostCapabilities = {
  readonly schemaVersion: string;
  readonly commands: readonly HostCommandCapability[];
};

export const toHostCommand = (event: HostCommandEvent): HostCommand => ({
  assistantTurnId: event.assistantTurnId,
  commandId: event.commandId,
  commandName: event.commandName,
  payload: event.payload,
});

export const supportsCommand = (
  capabilities: HostCapabilities,
  command: HostCommand,
): boolean =>
  capabilities.commands.some(
    (capability) =>
      capability.commandName === command.commandName &&
      supportsResourceType(capability, command.payload),
  );

const supportsResourceType = (
  capability: HostCommandCapability,
  payload: JsonObject,
): boolean => {
  const resourceTypes = capability.resourceTypes;
  if (!resourceTypes || resourceTypes.length === 0) return true;

  const resourceType = payload["resourceType"];
  return (
    typeof resourceType === "string" && resourceTypes.includes(resourceType)
  );
};
