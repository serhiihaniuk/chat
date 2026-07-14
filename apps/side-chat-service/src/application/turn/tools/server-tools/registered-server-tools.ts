import type { ServerToolDefinition } from "./server-tool-catalog.js";

/**
 * Single production catalog used both to expose tools to WorkflowAgent and to
 * reload the current definition inside the post-approval execution step.
 */
export const REGISTERED_SERVER_TOOLS: readonly ServerToolDefinition[] = Object.freeze([]);

export function selectRegisteredServerTools(
  names: readonly string[],
): readonly ServerToolDefinition[] {
  return names.map((name) => {
    const definition = REGISTERED_SERVER_TOOLS.find((candidate) => candidate.name === name);
    if (definition === undefined) throw new Error(`Server tool is not registered: ${name}`);
    return definition;
  });
}
