import type { ActivityEvent, ActivityHostCommandDetails } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";

/** A protocol activity narrowed to the host-command payload the bridge can dispatch. */
export type HostCommandActivityEvent = ActivityEvent & {
  readonly activityKind: "host_command";
  readonly details: {
    readonly hostCommand: ActivityHostCommandDetails;
  };
};

/** Command identity and JSON payload delivered to the embedding host. */
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
 * (`@side-chat/partner-ai-core`): both describe the same command by name, while
 * this browser shape also carries `resourceTypes` (which resources the bridge
 * can act on). The core shape records the server's deployment catalog. This
 * browser shape is sent per turn and is what the runtime exposes to the model.
 */
export type BrowserHostCommandCapability = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly resourceTypes?: readonly string[] | undefined;
};

/**
 * Browser command menu available on the current host surface.
 *
 * `schemaVersion` lets the host evolve its declaration shape deliberately;
 * commands are the exact set the bridge is prepared to dispatch for this read.
 */
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
