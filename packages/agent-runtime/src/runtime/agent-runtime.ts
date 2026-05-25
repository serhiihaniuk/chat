import { Effect, Stream } from "effect";

import { createPromptRenderer, type PromptRenderer } from "#context/prompt-renderer";
import {
  runtimeStreamFromAsyncIterable,
  runtimeStreamToAsyncIterable,
  type RuntimeEventStream,
} from "#effect/stream-interop";
import { runAiSdkToolLoopAgent } from "#ai-sdk/tool-loop-agent-runner";
import type { ModelProvider, ProviderSelection } from "#providers/model-provider";
import { createProviderRegistry } from "#providers/provider-registry";
import type { AssistantProfile } from "#profiles/assistant-profile";
import { createProfileRegistry } from "#profiles/profile-registry";
import { createToolRegistry } from "#tools/tool-registry";
import { selectRuntimeTools } from "#tools/tool-selection";
import type { RuntimeTool } from "#tools/runtime-tool";
import { AgentRuntimeError } from "./runtime-error.js";
import type { RuntimeEvent } from "./runtime-event.js";
import type { AgentRuntimeRequest, RuntimeProviderRequest } from "./runtime-request.js";

export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

export type AgentRuntimeOptions = {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
  readonly promptRenderer?: PromptRenderer;
};

export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const providerRegistry = createProviderRegistry(options.providers);
  const profileRegistry = createProfileRegistry(options.profiles);
  const toolRegistry = createToolRegistry(options.tools ?? []);
  const promptRenderer = options.promptRenderer ?? createPromptRenderer();

  const runtime: AgentRuntime = {
    stream(request) {
      return runtimeStreamToAsyncIterable(runtime.streamEffect(request));
    },
    streamEffect(request) {
      return Stream.unwrap(
        Effect.map(createRuntimeExecution(request), ({ model, providerOptions, providerRequest }) =>
          runtimeStreamFromAsyncIterable(
            runAiSdkToolLoopAgent({
              model,
              providerOptions,
              request: providerRequest,
            }),
          ),
        ),
      );
    },
  };

  const createRuntimeExecution = (request: AgentRuntimeRequest) =>
    Effect.gen(function* () {
      const profile = yield* resolveProfile(request.profileId);
      const selection = yield* Effect.try({
        try: () => resolveProviderSelection(request, profile, providerRegistry.providers),
        catch: (error) => toRuntimeError(error),
      });
      const provider = yield* providerRegistry.resolve(selection);
      const model = yield* provider.resolveModel(selection);
      const providerOptions = provider.resolveProviderOptions
        ? yield* provider.resolveProviderOptions(selection)
        : undefined;
      const tools = yield* resolveTools(request, profile);
      const messages = promptRenderer.render({
        profile,
        messages: request.messages,
        ...(request.contextBoard ? { contextBoard: request.contextBoard } : {}),
      });
      const providerRequest: RuntimeProviderRequest = {
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        providerId: selection.providerId,
        modelId: selection.modelId,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
        ...(request.abortSignal ? { abortSignal: request.abortSignal } : {}),
      };

      return { model, providerOptions, providerRequest };
    });

  const resolveProfile = (profileId: string | undefined) =>
    Effect.try({
      try: () => profileRegistry.resolve(profileId),
      catch: (error) => toRuntimeError(error),
    });

  const resolveTools = (request: AgentRuntimeRequest, profile: AssistantProfile) =>
    Effect.try({
      try: () =>
        selectRuntimeTools({
          registry: toolRegistry,
          profileToolNames: profile.defaultToolNames,
          requestToolNames: request.availableToolNames,
          turnTools: request.tools,
        }),
      catch: (error) => toRuntimeError(error),
    });

  return runtime;
};

const resolveProviderSelection = (
  request: AgentRuntimeRequest,
  profile: AssistantProfile,
  providers: readonly ModelProvider[],
): ProviderSelection => {
  const providerId = request.providerId ?? profile.defaultProviderId ?? onlyProviderId(providers);
  const provider = providers.find((entry) => entry.providerId === providerId);
  const modelId = request.modelId ?? profile.defaultModelId ?? provider?.modelIds[0];

  if (!providerId) {
    throw new AgentRuntimeError("provider_unavailable", "No provider selected for runtime turn.");
  }
  if (!modelId) {
    throw new AgentRuntimeError("model_unavailable", "No model selected for runtime turn.");
  }

  return { providerId, modelId };
};

const onlyProviderId = (providers: readonly ModelProvider[]): string | undefined =>
  providers.length === 1 ? providers[0]?.providerId : undefined;

const toRuntimeError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    "internal_error",
    error instanceof Error ? error.message : "agent runtime failed",
  );
};
