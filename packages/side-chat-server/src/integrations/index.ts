import type { ServerToolDefinition } from "#server-tools";

const INTEGRATION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/u;

export type SideChatIntegration = Readonly<{
  name: string;
  serverTools: readonly ServerToolDefinition[];
}>;

export type SideChatDefinition = Readonly<{
  integrations: readonly SideChatIntegration[];
}>;

export function defineSideChatIntegration(integration: SideChatIntegration): SideChatIntegration {
  if (!INTEGRATION_NAME_PATTERN.test(integration.name)) {
    throw new TypeError(`Side Chat integration name is invalid: ${integration.name}`);
  }
  assertUniqueNames(
    integration.serverTools.map((tool) => tool.name),
    "server tool",
  );
  return Object.freeze({
    name: integration.name,
    serverTools: Object.freeze([...integration.serverTools]),
  });
}

export function defineSideChat(definition: SideChatDefinition): SideChatDefinition {
  assertUniqueNames(
    definition.integrations.map((integration) => integration.name),
    "integration",
  );
  const integrations = definition.integrations.map(defineSideChatIntegration);
  assertUniqueNames(
    integrations.flatMap((integration) => integration.serverTools.map((tool) => tool.name)),
    "server tool",
  );
  return Object.freeze({ integrations: Object.freeze(integrations) });
}

export function serverToolsForSideChat(
  definition: SideChatDefinition,
): readonly ServerToolDefinition[] {
  return definition.integrations.flatMap((integration) => integration.serverTools);
}

export function selectRegisteredServerTools(
  definition: SideChatDefinition,
  names: readonly string[],
): readonly ServerToolDefinition[] {
  const registered = serverToolsForSideChat(definition);
  return names.map((name) => {
    const tool = registered.find((candidate) => candidate.name === name);
    if (tool === undefined) throw new Error(`Server tool is not registered: ${name}`);
    return tool;
  });
}

function assertUniqueNames(names: readonly string[], kind: string): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) throw new TypeError(`Duplicate ${kind} name: ${name}`);
    seen.add(name);
  }
}
