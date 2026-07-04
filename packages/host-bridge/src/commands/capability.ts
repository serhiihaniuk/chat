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

/**
 * A command the browser bridge can perform, as advertised by `getCapabilities`.
 *
 * Named to stay distinct from core's manifest `HostCommandCapability`
 * (`@side-chat/partner-ai-core`): both describe the same command by name, but the
 * server side carries `approvalMode` (turn policy) while this browser side carries
 * `resourceTypes` (which resources the bridge can act on). A command must appear
 * on BOTH sides — the server exposes it to the model, the browser performs it.
 */
export type BrowserHostCommandCapability = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly resourceTypes?: readonly string[] | undefined;
};

export type HostCapabilities = {
  readonly schemaVersion: string;
  readonly commands: readonly BrowserHostCommandCapability[];
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

const supportsResourceType = (
  capability: BrowserHostCommandCapability,
  payload: JsonObject,
): boolean => {
  const resourceTypes = capability.resourceTypes;
  // No resource list means the command applies to every resource. If a list is
  // present, the command payload must name one allowed resource type.
  if (!resourceTypes || resourceTypes.length === 0) return true;

  const resourceType = payload["resourceType"];
  return typeof resourceType === "string" && resourceTypes.includes(resourceType);
};
