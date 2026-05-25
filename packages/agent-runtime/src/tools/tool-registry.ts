import { AgentRuntimeError } from "#runtime/runtime-error";
import type { RuntimeTool } from "./runtime-tool.js";

export type {
  RuntimeTool,
  RuntimeToolContext,
  RuntimeToolEffect,
  RuntimeToolError,
  RuntimeToolRequirements,
} from "./runtime-tool.js";

export type ToolRegistry = {
  readonly tools: readonly RuntimeTool[];
  resolve(name: string): RuntimeTool;
};

export const createToolRegistry = (tools: readonly RuntimeTool[] = []): ToolRegistry => {
  const byName = new Map<string, RuntimeTool>();
  for (const tool of tools) {
    if (byName.has(tool.name)) {
      throw new AgentRuntimeError("tool_unavailable", `duplicate tool ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  return {
    tools,
    resolve(name) {
      const tool = byName.get(name);
      if (!tool) {
        throw new AgentRuntimeError("tool_unavailable", `tool ${name} is not registered`);
      }
      return tool;
    },
  };
};
