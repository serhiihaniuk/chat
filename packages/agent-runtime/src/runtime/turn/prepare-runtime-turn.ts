import type { ModelProvider, ProviderSelection } from "#providers/model-provider";
import { optionalField } from "@side-chat/shared";
import type { RuntimeTool } from "#tools/runtime-tool";
import type { AgentExecutor } from "../executors/agent-executor.js";
import {
  createExecutorCatalog,
  resolveAgentExecutor,
  type ExecutorCatalog,
} from "../executors/executor-selection.js";
import type {
  AgentRuntimeRequest,
  RuntimeMessage,
  RuntimeProviderRequest,
} from "../contract/runtime-request.js";
import {
  createProfileCatalog,
  resolveProfile,
  type AssistantProfile,
  type ProfileCatalog,
} from "./assistant-profile.js";
import {
  createProviderCatalog,
  resolveProvider,
  resolveProviderSelection,
  type ProviderCatalog,
} from "./provider-selection.js";
import { renderRuntimeMessages } from "./prompt-rendering.js";
import { createToolCatalog, selectRuntimeTools, type ToolCatalog } from "./tool-selection.js";

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
  readonly profiles: ProfileCatalog;
  readonly tools: ToolCatalog;
};

/**
 * Checked runtime plan used to open the stream.
 *
 * After this exists, the runtime knows which executor to call, which provider
 * owns the selected model, and what messages/tools to send.
 */
export type PreparedRuntimeTurn = {
  readonly executor: AgentExecutor;
  readonly provider: ModelProvider;
  readonly selection: ProviderSelection;
  readonly providerRequest: RuntimeProviderRequest;
};

export const createRuntimeState = (options: {
  readonly executors?: readonly AgentExecutor[];
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
}): RuntimeState => ({
  executors: createExecutorCatalog(options.executors),
  providers: createProviderCatalog(options.providers),
  profiles: createProfileCatalog(options.profiles),
  tools: createToolCatalog(options.tools),
});

/**
 * Prepare the runtime-side inputs needed before model streaming starts.
 *
 * This checks the selected profile, executor, provider, model, tools, and
 * messages. It does not call the model.
 */
export const prepareRuntimeTurn = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): PreparedRuntimeTurn => {
  // Pick the instructions and usual defaults before applying request choices.
  const profile = resolveProfile(state.profiles, request.profileId);

  // Choose the execution engine before any provider stream can open.
  const executor = resolveAgentExecutor(state.executors, request);

  // Make sure the selected provider/model pair is registered.
  const selection = resolveProviderSelection(request, profile, state.providers.providers);
  const provider = resolveProvider(state.providers, selection);

  // Keep only the tools selected for this turn.
  const tools = selectRuntimeTools(state.tools, profile, request);

  // Build the final model messages after instructions, context, and tools are fixed.
  const messages = renderRuntimeMessages(profile, request);

  return {
    executor,
    provider,
    selection,
    providerRequest: createProviderRequest(request, selection, tools, messages),
  };
};

/**
 * Build the object passed to `executor.stream`.
 *
 * At this point provider/model ids, messages, and tools are final for this
 * turn.
 */
const createProviderRequest = (
  request: AgentRuntimeRequest,
  selection: ProviderSelection,
  tools: readonly RuntimeTool[],
  messages: readonly RuntimeMessage[],
): RuntimeProviderRequest => ({
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  providerId: selection.providerId,
  modelId: selection.modelId,
  messages,
  ...optionalField("tools", tools.length > 0 ? tools : undefined),
  ...optionalField("toolScope", request.toolScope),
  ...optionalField("abortSignal", request.abortSignal),
});
