import {
  createProviderRegistry,
  type ProviderSelection,
} from "../registry/provider-registry.js";
import {
  createToolRegistry,
  type RuntimeTool,
} from "../tools/tool-registry.js";
import type { RuntimeEvent } from "../events.js";
import type { AssistantProvider, RuntimeMessage } from "../provider.js";

export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
};

export type AgentRuntimeRequest = ProviderSelection & {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly toolNames?: readonly string[];
};

export type AgentRuntimeOptions = {
  readonly providers: readonly AssistantProvider[];
  readonly tools?: readonly RuntimeTool[];
};

export type AgentRuntimeProfile = {
  readonly profileId: string;
  readonly instructions?: string;
  readonly defaultToolNames?: readonly string[];
};

export const createAgentRuntime = (
  options: AgentRuntimeOptions,
): AgentRuntime => {
  const providerRegistry = createProviderRegistry(options.providers);
  const toolRegistry = createToolRegistry(options.tools ?? []);

  return {
    stream(request) {
      for (const toolName of request.toolNames ?? [])
        toolRegistry.resolve(toolName);
      const provider = providerRegistry.resolve(request);
      return provider.stream({
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        providerId: provider.providerId,
        modelId: request.modelId,
        messages: request.messages,
        ...(request.toolNames ? { toolNames: request.toolNames } : {}),
      });
    },
  };
};
