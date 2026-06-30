import type { AiRuntimeMessage, AiRuntimeRequest } from "@side-chat/ai-runtime-contract";
import type { ModelProvider } from "#providers/model-provider";
import type { HostCommandResolver, RuntimeTool } from "#tools/runtime-tool";
import type { AgentExecutor } from "../executors/agent-executor.js";
import {
  createExecutorCatalog,
  resolveAgentExecutor,
  type ExecutorCatalog,
} from "../executors/executor-selection.js";
import type { RuntimeProviderRequest } from "./runtime-provider-request.js";
import {
  createProviderCatalog,
  resolveProvider,
  type ProviderCatalog,
} from "./provider-selection.js";
import { createToolCatalog, selectRuntimeToolsByName, type ToolCatalog } from "./tool-selection.js";

/**
 * RuntimeState is the indexed copy of what the app injected at startup.
 *
 * It answers lookup questions such as "is provider openai registered?" and
 * "what tools are known globally?" The request still decides which registered
 * capabilities are allowed for one assistant turn.
 */
export type RuntimeState = {
  readonly executors: ExecutorCatalog;
  readonly providers: ProviderCatalog;
  readonly tools: ToolCatalog;
};

/**
 * Checked runtime plan used to open the stream.
 *
 * After this exists, the runtime knows which executor to call, which provider
 * owns the selected model, and what messages/tools to send.
 */
export type PreparedRuntimeExecution = {
  readonly executor: AgentExecutor;
  readonly provider: ModelProvider;
  readonly providerRequest: RuntimeProviderRequest;
};

export const createRuntimeState = (options: {
  readonly executors?: readonly AgentExecutor[] | undefined;
  readonly providers: readonly ModelProvider[];
  readonly tools?: readonly RuntimeTool[] | undefined;
  readonly flushIntervalMs?: number | undefined;
  readonly hostCommandResolver?: HostCommandResolver | undefined;
}): RuntimeState => ({
  executors: createExecutorCatalog(options.executors, {
    flushIntervalMs: options.flushIntervalMs,
    hostCommandResolver: options.hostCommandResolver,
  }),
  providers: createProviderCatalog(options.providers),
  tools: createToolCatalog(options.tools),
});

/**
 * Prepare the runtime-side inputs needed before model streaming starts.
 *
 * Source is partner-ai-core's final AiRuntimeRequest. Target is one registered
 * AgentExecutor. Invariant: runtime validates local registrations but does not
 * add product policy, prompt text, or context.
 */
export const prepareRuntimeExecution = (
  state: RuntimeState,
  request: AiRuntimeRequest,
): PreparedRuntimeExecution => {
  // Choose the execution engine before any provider stream can open.
  const executor = resolveAgentExecutor(state.executors, request.executorId);

  // Make sure the selected provider/model pair is registered.
  const provider = resolveProvider(state.providers, request.providerId, request.modelId);

  // Keep only the tools selected for this turn.
  const tools = selectRuntimeToolsByName(state.tools, request.toolNames);

  return {
    executor,
    provider,
    providerRequest: createProviderRequest(request, tools, request.messages),
  };
};

/**
 * Build the object passed to `executor.stream`.
 *
 * At this point provider/model ids, messages, and tools are final for this
 * turn.
 */
const createProviderRequest = (
  request: AiRuntimeRequest,
  tools: readonly RuntimeTool[],
  messages: readonly AiRuntimeMessage[],
): RuntimeProviderRequest => ({
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  providerId: request.providerId,
  modelId: request.modelId,
  messages,
  tools: tools.length > 0 ? tools : undefined,
  toolScope: request.toolScope,
  abortSignal: request.abortSignal,
});
