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

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const providerRegistry = createProviderRegistry(options.providers);
  const toolRegistry = createToolRegistry(options.tools ?? []);

  return {
    stream(request) {
      const tools = request.toolNames
        ? request.toolNames.map((toolName) => toolRegistry.resolve(toolName))
        : selectAutoInvokedTools(toolRegistry.tools, request);
      const provider = providerRegistry.resolve(request);
      return streamWithBackendTools(tools, request, provider);
    },
  };
};

const selectAutoInvokedTools = (
  tools: readonly RuntimeTool[],
  request: AgentRuntimeRequest,
): readonly RuntimeTool[] => {
  return tools.filter((tool) => tool.shouldInvoke?.(request) === true);
};

const streamWithBackendTools = async function* (
  tools: readonly RuntimeTool[],
  request: AgentRuntimeRequest,
  provider: AssistantProvider,
): AsyncIterable<RuntimeEvent> {
  const toolContextMessages: RuntimeMessage[] = [];
  let sequence = 0;

  for (const tool of tools) {
    const input = tool.createInput?.(request) ?? { query: lastUserText(request) };
    const toolCallId = `${tool.name}-${request.requestId}`;
    for (const content of tool.progress?.(input) ?? []) {
      yield {
        type: "runtime.reasoning",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        summary: content,
      };
      sequence += 1;
    }

    yield {
      type: "runtime.tool_call",
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      toolCallId,
      toolName: tool.name,
      argumentsJson: input,
    };
    sequence += 1;

    try {
      const resultJson = await tool.run(input);
      toolContextMessages.push({
        role: "system",
        content: `Backend tool ${tool.name} returned:\n${JSON.stringify(resultJson, null, 2)}`,
      });
      yield {
        type: "runtime.tool_result",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        toolCallId,
        toolName: tool.name,
        status: "completed",
        resultJson,
      };
    } catch {
      yield {
        type: "runtime.tool_result",
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        toolCallId,
        toolName: tool.name,
        status: "failed",
        errorCode: "tool_failed",
      };
    }
    sequence += 1;
  }

  for await (const event of provider.stream({
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    providerId: provider.providerId,
    modelId: request.modelId,
    messages: [...request.messages, ...toolContextMessages],
    ...(request.toolNames ? { toolNames: request.toolNames } : {}),
  })) {
    yield event;
  }
};

const lastUserText = (request: AgentRuntimeRequest): string =>
  [...request.messages].reverse().find((message) => message.role === "user")?.content ?? "";
