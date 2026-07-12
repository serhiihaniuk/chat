import type { ServerToolDefinition } from "./server-tool-catalog.js";

/**
 * Single production catalog used both to expose tools to WorkflowAgent and to
 * reload the current definition inside the post-approval execution step.
 */
export const REGISTERED_SERVER_TOOLS: readonly ServerToolDefinition[] = Object.freeze([]);

export function findRegisteredServerTool(name: string): ServerToolDefinition | undefined {
  return REGISTERED_SERVER_TOOLS.find((definition) => definition.name === name);
}
