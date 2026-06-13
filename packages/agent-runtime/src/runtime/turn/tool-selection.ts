import { createToolRegistry, type ToolRegistry } from "#tools/tool-registry";
import type { RuntimeTool } from "#tools/runtime-tool";
import { AgentRuntimeError } from "../contract/runtime-error.js";
import type { AgentRuntimeRequest } from "../contract/runtime-request.js";
import type { AssistantProfile } from "./assistant-profile.js";

export type ToolCatalog = ToolRegistry;

export const createToolCatalog = (tools: readonly RuntimeTool[] | undefined): ToolCatalog =>
  createToolRegistry(tools ?? []);

/**
 * Select the exact tools the model can see for one assistant turn.
 *
 * Source registration alone is not permission. If neither the request nor the profile
 * provides an allowlist, the model sees no tools. That fail-closed default lets
 * partner-ai-core make capability exposure an explicit per-turn policy decision.
 */
export const selectRuntimeTools = (
  registry: ToolRegistry,
  profile: AssistantProfile,
  request: AgentRuntimeRequest,
): readonly RuntimeTool[] => {
  const mergedTools = new Map(registry.tools.map((tool) => [tool.name, tool]));
  for (const tool of request.tools ?? []) {
    if (mergedTools.has(tool.name)) {
      throw new AgentRuntimeError("tool_unavailable", `duplicate tool ${tool.name}`);
    }
    mergedTools.set(tool.name, tool);
  }

  const selectedNames = request.availableToolNames ?? profile.defaultToolNames;
  if (!selectedNames) return [];

  return selectedNames.map((name) => {
    const tool = mergedTools.get(name);
    if (!tool) {
      throw new AgentRuntimeError("tool_unavailable", `tool ${name} is not registered`);
    }
    return tool;
  });
};
