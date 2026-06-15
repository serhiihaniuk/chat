import { Cause, Effect, Stream } from "effect";

import type { ModelProvider } from "#providers/model-provider";
import type { RuntimeTool } from "#tools/runtime-tool";
import { AgentRuntimeError } from "./contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "./contract/runtime-event.js";
import type { RuntimeEventStream } from "./contract/runtime-stream.js";
import type { AgentRuntimeRequest, RuntimeProviderRequest } from "./contract/runtime-request.js";
import type { AgentExecutor } from "./executors/agent-executor.js";
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
export {
  DEFAULT_AGENT_EXECUTOR_ID,
  type AgentExecutionRequest,
  type AgentExecutor,
} from "./executors/agent-executor.js";

export type AgentRuntime = {
  streamEffect(request: AgentRuntimeRequest): RuntimeEventStream;
};

/**
 * These options are the capabilities the runtime may use on future requests.
 *
 * Source is app composition: it injects providers and tools once. A later
 * AgentRuntimeRequest decides which executor, profile, provider, model, and
 * tools are actually used for that specific assistant turn.
 */
export type AgentRuntimeOptions = {
  readonly executors?: readonly AgentExecutor[] | undefined;
  readonly providers: readonly ModelProvider[];
  readonly profiles?: readonly AssistantProfile[] | undefined;
  readonly tools?: readonly RuntimeTool[] | undefined;
};

type RuntimeExecution = {
  readonly executor: AgentExecutor;
  readonly model: unknown;
  readonly providerOptions: unknown;
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

  const streamEffect = (request: AgentRuntimeRequest): RuntimeEventStream =>
    catchRuntimeDefects(openPreparedRuntimeStream(state, request));

  return {
    streamEffect,
  };
};

const openPreparedRuntimeStream = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): RuntimeEventStream => {
  const preparedStream = Effect.map(createRuntimeExecution(state, request), openExecutorStream);
  return Stream.unwrap(preparedStream);
};

const openExecutorStream = ({
  executor,
  model,
  providerOptions,
  providerRequest,
}: RuntimeExecution): RuntimeEventStream =>
  executor.stream({
    model,
    providerOptions,
    providerRequest,
  });

const createRuntimeExecution = (
  state: RuntimeState,
  request: AgentRuntimeRequest,
): Effect.Effect<RuntimeExecution, AgentRuntimeError> =>
  Effect.gen(function* () {
    /**
     * prepareRuntimeTurn answers the questions that must be settled before the
     * model starts:
     *
     * Which executor is allowed? Which profile is active? Which provider/model
     * is selected? Which tools are the model allowed to see? What final message
     * list will the provider get?
     */
    const turn = yield* attemptRuntime(() => prepareRuntimeTurn(state, request));
    const { executor, provider, providerRequest, selection } = turn;
    const model = yield* provider.resolveModel(selection);
    const providerOptions = provider.resolveProviderOptions
      ? yield* provider.resolveProviderOptions(selection)
      : undefined;

    return {
      executor,
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

/**
 * Catch raw throws from adapters and turn them into runtime errors.
 *
 * Most failures should use Effect.fail or Effect.try. This protects callers when
 * adapter code throws before it can return a typed AgentRuntimeError.
 */
const catchRuntimeDefects = (stream: RuntimeEventStream): RuntimeEventStream =>
  Stream.catchCauseIf(stream, Cause.hasDies, (cause) =>
    Stream.fail(toRuntimeError(Cause.squash(cause))),
  );

const toRuntimeError = (error: unknown): AgentRuntimeError => {
  if (error instanceof AgentRuntimeError) return error;
  return new AgentRuntimeError(
    RUNTIME_ERROR_CODES.INTERNAL_ERROR,
    error instanceof Error ? error.message : "agent runtime failed",
  );
};
