import { Effect, Stream } from "effect";
import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import { runAiSdkToolLoopAgent } from "./ai-sdk/tool-loop-agent-runner.js";
import type { ModelProvider, ProviderSelection } from "#providers/model-provider";
import { createToolRegistry, type ToolRegistry } from "#tools/tool-registry";
import type { RuntimeTool } from "#tools/runtime-tool";
import { AgentRuntimeError } from "./runtime-error.js";
import type { RuntimeEvent } from "./runtime-event.js";
import {
  runtimeStreamFromAsyncIterable,
  runtimeStreamToAsyncIterable,
  type RuntimeEventStream,
} from "./runtime-stream.js";
import type {
  AgentRuntimeRequest,
  RuntimeContextBoard,
  RuntimeContextSection,
  RuntimeMessage,
  RuntimeProviderRequest,
} from "./runtime-request.js";

/**
 * An assistant profile is reusable runtime configuration.
 *
 * Product policy chooses which profile is allowed for a turn. The runtime only
 * reads instructions, provider/model defaults, and default tool names from it.
 */
export type AssistantProfile = {
  readonly profileId: string;
  readonly displayName?: string;
  readonly systemInstructions: string;
  readonly defaultProviderId?: string;
  readonly defaultModelId?: string;
  readonly defaultToolNames?: readonly string[];
};

export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

/**
 * Runtime construction receives only reusable capabilities.
 *
 * Concrete tools and providers are owned by the consuming app. This package
 * keeps their protocols and turns them into one AI SDK ToolLoopAgent run.
 */
export type AgentRuntimeOptions = {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
};

export const DEFAULT_ASSISTANT_PROFILE_ID = "default" as const;

export const createDefaultAssistantProfile = (): AssistantProfile => ({
  profileId: DEFAULT_ASSISTANT_PROFILE_ID,
  systemInstructions:
    "Render final assistant answers as GitHub-flavored Markdown. Use bullet or numbered lists when the answer contains multiple items, preserve emphasis with Markdown syntax, and keep tool payload JSON out of the visible answer unless the user explicitly asks for raw data.",
});

type RuntimeExecution = {
  readonly model: LanguageModel;
  readonly providerOptions: ToolLoopAgentSettings["providerOptions"] | undefined;
  readonly providerRequest: RuntimeProviderRequest;
};

type RuntimeState = {
  readonly providers: ProviderCatalog;
  readonly profiles: ProfileCatalog;
  readonly tools: ToolRegistry;
};

type ProviderCatalog = {
  readonly providers: readonly ModelProvider[];
  readonly byId: ReadonlyMap<string, ModelProvider>;
};

type ProfileCatalog = {
  readonly byId: ReadonlyMap<string, AssistantProfile>;
};

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const state = createRuntimeState(options);

  const streamEffect = (request: AgentRuntimeRequest): RuntimeEventStream =>
    Stream.unwrap(
      Effect.map(
        createRuntimeExecution(state, request),
        ({ model, providerOptions, providerRequest }) =>
          runtimeStreamFromAsyncIterable(
            runAiSdkToolLoopAgent({
              model,
              providerOptions,
              request: providerRequest,
            }),
          ),
      ),
    );

  return {
    stream: (request) => runtimeStreamToAsyncIterable(streamEffect(request)),
    streamEffect,
  };
};

const createRuntimeState = (options: AgentRuntimeOptions): RuntimeState => ({
  providers: createProviderCatalog(options.providers),
  profiles: createProfileCatalog(options.profiles),
  tools: createToolRegistry(options.tools ?? []),
});

const createRuntimeExecution = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): Effect.Effect<RuntimeExecution, AgentRuntimeError> =>
  Effect.gen(function* () {
    const profile = yield* attemptRuntime(() => resolveProfile(state.profiles, request.profileId));
    const selection = yield* attemptRuntime(() =>
      resolveProviderSelection(request, profile, state.providers.providers),
    );
    const provider = yield* attemptRuntime(() => resolveProvider(state.providers, selection));
    const model = yield* provider.resolveModel(selection);
    const providerOptions = provider.resolveProviderOptions
      ? yield* provider.resolveProviderOptions(selection)
      : undefined;
    const tools = yield* attemptRuntime(() => selectRuntimeTools(state.tools, profile, request));
    const messages = renderRuntimeMessages(profile, request);
    const providerRequest = createProviderRequest(request, selection, tools, messages);

    return {
      model,
      providerOptions,
      providerRequest,
    };
  });

const createProviderCatalog = (providers: readonly ModelProvider[]): ProviderCatalog => {
  const byId = new Map<string, ModelProvider>();
  for (const provider of providers) {
    if (byId.has(provider.providerId)) {
      throw new AgentRuntimeError(
        "provider_unavailable",
        `duplicate provider ${provider.providerId}`,
      );
    }
    byId.set(provider.providerId, provider);
  }

  return { providers, byId };
};

const createProfileCatalog = (
  profiles: readonly AssistantProfile[] = [createDefaultAssistantProfile()],
): ProfileCatalog => {
  const normalizedProfiles = profiles.length > 0 ? profiles : [createDefaultAssistantProfile()];
  const byId = new Map<string, AssistantProfile>();
  for (const profile of normalizedProfiles) {
    if (byId.has(profile.profileId)) {
      throw new AgentRuntimeError("internal_error", `duplicate profile ${profile.profileId}`);
    }
    byId.set(profile.profileId, profile);
  }

  return { byId };
};

const resolveProviderSelection = (
  request: AgentRuntimeRequest,
  profile: AssistantProfile,
  providers: readonly ModelProvider[],
): ProviderSelection => {
  const providerId = request.providerId ?? profile.defaultProviderId ?? onlyProviderId(providers);
  const provider = providers.find((entry) => entry.providerId === providerId);
  const modelId = request.modelId ?? profile.defaultModelId ?? provider?.modelIds[0];

  if (!providerId)
    throw new AgentRuntimeError("provider_unavailable", "No provider selected for runtime turn.");
  if (!modelId)
    throw new AgentRuntimeError("model_unavailable", "No model selected for runtime turn.");

  return { providerId, modelId };
};

const resolveProvider = (catalog: ProviderCatalog, selection: ProviderSelection): ModelProvider => {
  const provider = catalog.byId.get(selection.providerId);
  if (!provider) {
    throw new AgentRuntimeError(
      "provider_unavailable",
      `provider ${selection.providerId} is not registered`,
    );
  }
  if (!provider.modelIds.includes(selection.modelId)) {
    throw new AgentRuntimeError(
      "model_unavailable",
      `model ${selection.modelId} is not registered for provider ${selection.providerId}`,
    );
  }
  return provider;
};

const resolveProfile = (
  catalog: ProfileCatalog,
  profileId: string | undefined = DEFAULT_ASSISTANT_PROFILE_ID,
): AssistantProfile => {
  const profile = catalog.byId.get(profileId);
  if (!profile) {
    throw new AgentRuntimeError("internal_error", `profile ${profileId} is not registered`);
  }
  return profile;
};

const selectRuntimeTools = (
  registry: ToolRegistry,
  profile: AssistantProfile,
  request: AgentRuntimeRequest,
): readonly RuntimeTool[] => {
  const mergedTools = new Map(registry.tools.map((tool) => [tool.name, tool]));
  for (const tool of request.tools ?? []) {
    if (mergedTools.has(tool.name)) {
      throw new AgentRuntimeError("tool_unavailable", `duplicate tool ${tool.name}`);
    }
    mergedTools.set(tool.name, tool);
  }

  const selectedNames = request.availableToolNames ?? profile.defaultToolNames;
  if (!selectedNames) return [...mergedTools.values()];

  return selectedNames.map((name) => {
    const tool = mergedTools.get(name);
    if (!tool) {
      throw new AgentRuntimeError("tool_unavailable", `tool ${name} is not registered`);
    }
    return tool;
  });
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

const renderRuntimeMessages = (
  profile: AssistantProfile,
  request: AgentRuntimeRequest,
): readonly RuntimeMessage[] => [
  profileToSystemMessage(profile),
  ...(request.contextBoard ? [contextBoardToSystemMessage(request.contextBoard)] : []),
  ...request.messages,
];

const profileToSystemMessage = (profile: AssistantProfile): RuntimeMessage => ({
  role: "system",
  content: profile.systemInstructions,
});

const contextBoardToSystemMessage = (contextBoard: RuntimeContextBoard): RuntimeMessage => ({
  role: "system",
  content: `Trusted context board:\n\n${renderContextBoardSections(contextBoard)}`,
});

const renderContextBoardSections = (board: RuntimeContextBoard): string =>
  board.sections
    .toSorted(compareContextSections)
    .map((section) => `### ${section.title}\n${section.content.trim()}`)
    .join("\n\n");

const compareContextSections = (
  left: RuntimeContextSection,
  right: RuntimeContextSection,
): number => (right.priority ?? 0) - (left.priority ?? 0);

const onlyProviderId = (providers: readonly ModelProvider[]): string | undefined =>
  providers.length === 1 ? providers[0]?.providerId : undefined;

const attemptRuntime = <A>(tryFn: () => A): Effect.Effect<A, AgentRuntimeError> =>
  Effect.try({
    try: tryFn,
    catch: (error) => toRuntimeError(error),
  });

const toRuntimeError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    "internal_error",
    error instanceof Error ? error.message : "agent runtime failed",
  );
};
