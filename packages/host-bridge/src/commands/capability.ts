import type {
  ActivityEvent,
  ActivityHostCommandDetails,
} from "@side-chat/chat-protocol";
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

/** Native client-tool call supplied by the workflow UI branch. */
export type HostToolCall = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: JsonObject;
};

/**
 * Stable client-tool definition sent with a workflow turn.
 * Source: host capabilities. Target: the provider-free request catalog.
 */
export type HostClientToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

/**
 * One command advertised by the host bridge.
 *
 * Source: the host's `getCapabilities` response. Target: the native client-tool
 * catalog sent with a workflow turn. Invariant: the browser only dispatches a
 * tool whose name and resource constraints appear in this declaration.
 */
export type BrowserHostCommandCapability = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly resourceTypes?: readonly string[] | undefined;
};

/**
 * Capability snapshot returned by the current host surface.
 *
 * Source: one host capability read. Target: capability checks and the client-
 * tool catalog. Invariant: `commands` is the exact set the bridge may dispatch.
 */
export type HostCapabilities = {
  readonly schemaVersion: string;
  readonly commands: readonly BrowserHostCommandCapability[];
};

export const toClientToolDefinitions = (
  capabilities: HostCapabilities,
): readonly HostClientToolDefinition[] =>
  capabilities.commands.map((command) => ({
    name: command.commandName,
    description: command.description,
    inputSchema: command.inputSchema,
  }));

export const isHostCommandActivityEvent = (
  event: ActivityEvent,
): event is HostCommandActivityEvent =>
  event.activityKind === "host_command" &&
  event.details?.hostCommand !== undefined;

export const toHostCommand = (
  event: HostCommandActivityEvent,
): HostCommand => ({
  assistantTurnId: event.assistantTurnId,
  commandId: event.details.hostCommand.commandId,
  commandName: event.details.hostCommand.commandName,
  payload: event.details.hostCommand.payload,
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

export const supportsTool = (
  capabilities: HostCapabilities,
  toolCall: HostToolCall,
): boolean =>
  capabilities.commands.some(
    (capability) =>
      capability.commandName === toolCall.toolName &&
      supportsResourceTypeForTool(capability, toolCall.input),
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
  return (
    typeof resourceType === "string" && resourceTypes.includes(resourceType)
  );
};

const supportsResourceTypeForTool = (
  capability: BrowserHostCommandCapability,
  input: JsonObject,
): boolean => supportsResourceType(capability, input);
