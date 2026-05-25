import type { ModelProvider, ProviderSelection } from "#providers/model-provider";
import type { RuntimeTool } from "#tools/runtime-tool";
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
  readonly providers: ProviderCatalog;
  readonly profiles: ProfileCatalog;
  readonly tools: ToolCatalog;
};

/**
 * PreparedRuntimeTurn is the result of checking one AgentRuntimeRequest.
 *
 * After this exists, the runtime knows the exact provider object to call, the
 * selected provider/model ids, and the RuntimeProviderRequest that can be sent
 * to the AI SDK adapter.
 */
export type PreparedRuntimeTurn = {
  readonly provider: ModelProvider;
  readonly selection: ProviderSelection;
  readonly providerRequest: RuntimeProviderRequest;
};

export const createRuntimeState = (options: {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
}): RuntimeState => ({
  providers: createProviderCatalog(options.providers),
  profiles: createProfileCatalog(options.profiles),
  tools: createToolCatalog(options.tools),
});

/**
 * Convert a public AgentRuntimeRequest into the private provider-ready request.
 *
 * This function does not import AI SDK and does not call the model. It only
 * settles everything that must be known before streaming can start:
 * profile instructions, provider/model ids, allowed tools, and final messages.
 */
export const prepareRuntimeTurn = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): PreparedRuntimeTurn => {
  const profile = resolveProfile(state.profiles, request.profileId);
  const selection = resolveProviderSelection(request, profile, state.providers.providers);
  const provider = resolveProvider(state.providers, selection);
  const tools = selectRuntimeTools(state.tools, profile, request);
  const messages = renderRuntimeMessages(profile, request);

  return {
    provider,
    selection,
    providerRequest: createProviderRequest(request, selection, tools, messages),
  };
};

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
  ...(tools.length > 0 ? { tools } : {}),
  ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
});
