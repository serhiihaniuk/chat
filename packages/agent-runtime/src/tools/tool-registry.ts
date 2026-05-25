import { AgentRuntimeError } from "../errors.js";

export type RuntimeTool<
  Input extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
  Output extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = {
  readonly name: string;
  run(input: Input): Promise<Output> | Output;
};

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
