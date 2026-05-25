import { AgentRuntimeError } from "#runtime/runtime-error";
import type { RuntimeTool } from "./runtime-tool.js";
import type { ToolRegistry } from "./tool-registry.js";

export type RuntimeToolSelectionInput = {
  readonly registry: ToolRegistry;
  readonly profileToolNames?: readonly string[] | undefined;
  readonly requestToolNames?: readonly string[] | undefined;
  readonly turnTools?: readonly RuntimeTool[] | undefined;
};

export const selectRuntimeTools = ({
  profileToolNames,
  registry,
  requestToolNames,
  turnTools = [],
}: RuntimeToolSelectionInput): readonly RuntimeTool[] => {
  const mergedRegistry = new Map(registry.tools.map((tool) => [tool.name, tool]));
  for (const tool of turnTools) {
    if (mergedRegistry.has(tool.name)) {
      throw new AgentRuntimeError("tool_unavailable", `duplicate tool ${tool.name}`);
    }
    mergedRegistry.set(tool.name, tool);
  }

  const selectedNames = requestToolNames ?? profileToolNames;
  if (!selectedNames) return [...mergedRegistry.values()];

  return selectedNames.map((name) => {
    const tool = mergedRegistry.get(name);
    if (!tool) {
      throw new AgentRuntimeError("tool_unavailable", `tool ${name} is not registered`);
    }
    return tool;
  });
};
