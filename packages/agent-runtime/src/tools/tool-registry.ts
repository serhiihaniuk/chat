import { AgentRuntimeError } from "../errors.js";
import type { RuntimeMessage } from "../provider.js";
import type { JsonObject } from "@side-chat/chat-protocol";

export type RuntimeToolRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly messages: readonly RuntimeMessage[];
};

export type RuntimeTool = {
  readonly name: string;
  readonly description?: string;
  createInput?: (request: RuntimeToolRequest) => JsonObject;
  shouldInvoke?: (request: RuntimeToolRequest) => boolean;
  progress?: (input: JsonObject) => readonly string[];
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
