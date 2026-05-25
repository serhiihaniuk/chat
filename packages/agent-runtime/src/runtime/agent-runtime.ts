import { createProviderRegistry, type ProviderSelection } from "#registry/provider-registry";
import { createToolRegistry, type RuntimeTool } from "#tools/tool-registry";
import type { RuntimeEvent } from "../events.js";
import type { AssistantProvider, RuntimeMessage } from "../provider.js";

export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
};

export type AgentRuntimeRequest = ProviderSelection & {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly messages: readonly RuntimeMessage[];
};

export type AgentRuntimeOptions = {
  readonly providers: readonly AssistantProvider[];
  readonly tools?: readonly RuntimeTool[];
};

export type AgentRuntimeProfile = {
  readonly profileId: string;
  readonly instructions?: string;
  readonly availableToolNames?: readonly string[];
};

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const providerRegistry = createProviderRegistry(options.providers);
  const toolRegistry = createToolRegistry(options.tools ?? []);

  return {
    stream(request) {
      const tools = toolRegistry.tools;
      const provider = providerRegistry.resolve(request);
      return provider.stream({
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        providerId: provider.providerId,
        modelId: request.modelId,
        messages: createProviderMessages(request.messages),
        ...(tools.length > 0 ? { tools } : {}),
      });
    },
  };
};

const DEFAULT_ASSISTANT_INSTRUCTIONS: RuntimeMessage = {
  role: "system",
  content:
    "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
};

const createProviderMessages = (requestMessages: readonly RuntimeMessage[]): RuntimeMessage[] => [
  DEFAULT_ASSISTANT_INSTRUCTIONS,
  ...requestMessages,
];
