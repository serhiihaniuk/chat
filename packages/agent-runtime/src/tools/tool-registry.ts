import { AgentRuntimeError } from "../errors.js";
import type { ActivitySource, JsonObject } from "@side-chat/chat-protocol";
import type { JSONSchema7 } from "@ai-sdk/provider";

export type RuntimeTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  readSources?: (result: JsonObject) => readonly ActivitySource[];
  run(input: JsonObject): Promise<JsonObject> | JsonObject;
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
