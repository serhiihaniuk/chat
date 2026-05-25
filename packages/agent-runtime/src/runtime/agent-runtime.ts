import { Effect, Stream } from "effect";
import type { LanguageModel, ToolLoopAgentSettings } from "ai";

import { runAiSdkToolLoopAgent } from "./ai-sdk/tool-loop-agent-runner.js";
import type { ModelProvider } from "#providers/model-provider";
import type { RuntimeTool } from "#tools/runtime-tool";
import { AgentRuntimeError } from "./contract/runtime-error.js";
import type { RuntimeEvent } from "./contract/runtime-event.js";
import {
  runtimeStreamFromAsyncIterable,
  runtimeStreamToAsyncIterable,
  type RuntimeEventStream,
} from "./contract/runtime-stream.js";
import type { AgentRuntimeRequest, RuntimeProviderRequest } from "./contract/runtime-request.js";
import type { AssistantProfile } from "./turn/assistant-profile.js";
import {
  createRuntimeState,
  prepareRuntimeTurn,
  type RuntimeState,
} from "./turn/prepare-runtime-turn.js";

export {
  createDefaultAssistantProfile,
  DEFAULT_ASSISTANT_PROFILE_ID,
  type AssistantProfile,
} from "./turn/assistant-profile.js";

export type AgentRuntime = {
  stream(request: AgentRuntimeRequest): AsyncIterable<RuntimeEvent>;
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

/**
 * These options are the capabilities the runtime may use on future requests.
 *
 * The app injects providers and tools once at startup. A later
 * AgentRuntimeRequest decides which profile, provider, model, and tools are
 * actually used for that specific assistant turn.
 */
export type AgentRuntimeOptions = {
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[];
  readonly tools?: readonly RuntimeTool[];
};

type RuntimeExecution = {
  readonly model: LanguageModel;
  readonly providerOptions: ToolLoopAgentSettings["providerOptions"] | undefined;
  readonly providerRequest: RuntimeProviderRequest;
};

/**
 * Create the runtime object that partner-ai-core calls for every assistant turn.
 *
 * This does not start a model call. It only indexes the injected providers,
 * profiles, and tools so each request can be checked quickly before streaming.
 */
export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const state = createRuntimeState(options);

  /**
   * streamEffect is the Effect-native way to run one assistant turn.
   *
   * It prepares the provider-ready request first. If that succeeds, it opens
   * the AI SDK ToolLoopAgent stream and converts its async iterable into the
   * runtime's Effect Stream.
   */
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

const createRuntimeExecution = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): Effect.Effect<RuntimeExecution, AgentRuntimeError> =>
  Effect.gen(function* () {
    /**
     * prepareRuntimeTurn answers the questions that must be settled before the
     * model starts:
     *
     * Which profile is active? Which provider/model is selected? Which tools is
     * the model allowed to see? What final message list will the provider get?
     */
    const turn = yield* attemptRuntime(() => prepareRuntimeTurn(state, request));
    const { provider, providerRequest, selection } = turn;
    const model = yield* provider.resolveModel(selection);
    const providerOptions = provider.resolveProviderOptions
      ? yield* provider.resolveProviderOptions(selection)
      : undefined;

    return {
      model,
      providerOptions,
      providerRequest,
    };
  });

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
