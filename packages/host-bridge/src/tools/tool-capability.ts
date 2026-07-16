import type { JsonObject } from "@side-chat/shared";

export type HostToolCall = Readonly<{
  toolCallId: string;
  toolName: string;
  input: JsonObject;
}>;

export type HostClientToolDefinition = Readonly<{
  name: string;
  description: string;
  inputSchema: JsonObject;
}>;

export type BrowserToolCapability = Readonly<{
  toolName: string;
  description: string;
  inputSchema: JsonObject;
  resourceTypes?: readonly string[] | undefined;
}>;

export type HostCapabilities = Readonly<{
  schemaVersion: string;
  tools: readonly BrowserToolCapability[];
}>;

export const toClientToolDefinitions = (
  capabilities: HostCapabilities,
): readonly HostClientToolDefinition[] =>
  capabilities.tools.map((tool) => ({
    name: tool.toolName,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

export const supportsTool = (capabilities: HostCapabilities, toolCall: HostToolCall): boolean =>
  capabilities.tools.some(
    (capability) =>
      capability.toolName === toolCall.toolName && supportsResourceType(capability, toolCall.input),
  );

function supportsResourceType(capability: BrowserToolCapability, input: JsonObject): boolean {
  const resourceTypes = capability.resourceTypes;
  if (!resourceTypes || resourceTypes.length === 0) return true;
  const resourceType = input["resourceType"];
  return typeof resourceType === "string" && resourceTypes.includes(resourceType);
}
