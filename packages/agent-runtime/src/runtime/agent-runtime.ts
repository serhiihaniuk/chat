import { Cause, Effect, Stream } from "effect";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  type AiRuntimeEventStream,
  type AiRuntimePort,
  type AiRuntimeRequest,
} from "@side-chat/ai-runtime-contract";

import type { ModelProvider } from "#providers/model-provider";
import type { RuntimeTool } from "#tools/runtime-tool";
import type { RuntimeProviderRequest } from "./turn/runtime-provider-request.js";
import type { AgentExecutor } from "./executors/agent-executor.js";
import {
  createRuntimeState,
  prepareRuntimeExecution,
  type RuntimeState,
} from "./turn/prepare-runtime-execution.js";

export {
  DEFAULT_AGENT_EXECUTOR_ID,
  type AgentExecutionRequest,
  type AgentExecutor,
} from "./executors/agent-executor.js";

export type AgentRuntime = AiRuntimePort;

/**
 * These options are the capabilities the runtime may use on future requests.
 *
 * Source is app composition: it injects providers and tools once. A later
 * AiRuntimeRequest decides which executor, provider, model, and tool names are
 * actually used for that specific assistant turn.
 */
export type AgentRuntimeOptions = {
  readonly executors?: readonly AgentExecutor[] | undefined;
  readonly providers: readonly ModelProvider[];
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
 * executors, and tools so each request can be checked quickly before streaming.
 */
export const createAgentRuntime = (options: AgentRuntimeOptions): AgentRuntime => {
  const state = createRuntimeState(options);

  const streamEffect = (request: AiRuntimeRequest): AiRuntimeEventStream =>
    catchRuntimeDefects(openPreparedRuntimeStream(state, request));

  return {
    streamEffect,
  };
};

const openPreparedRuntimeStream = (
  state: RuntimeState,
  request: AiRuntimeRequest,
): AiRuntimeEventStream => {
  const preparedStream = Effect.map(createRuntimeExecution(state, request), openExecutorStream);
  return Stream.unwrap(preparedStream);
};

const openExecutorStream = ({
  executor,
  model,
  providerOptions,
  providerRequest,
}: RuntimeExecution): AiRuntimeEventStream =>
  executor.stream({
    model,
    providerOptions,
    providerRequest,
  });

const createRuntimeExecution = (
  state: RuntimeState,
  request: AiRuntimeRequest,
): Effect.Effect<RuntimeExecution, AiRuntimeError> =>
  Effect.gen(function* () {
    /**
     * prepareRuntimeExecution answers the questions that must be settled before
     * the model starts:
     *
     * Which executor is allowed? Which provider/model is selected? Which
     * registered tools are the model allowed to see? The message list is
     * already final and is passed through unchanged.
     */
    const prepared = yield* attemptRuntime(() => prepareRuntimeExecution(state, request));
    const { executor, provider, providerRequest } = prepared;
    const selection = {
      providerId: providerRequest.providerId,
      modelId: providerRequest.modelId,
    };
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

const attemptRuntime = <A>(tryFn: () => A): Effect.Effect<A, AiRuntimeError> =>
  Effect.try({
    try: tryFn,
    catch: (error) => toRuntimeError(error),
  });

/**
 * Catch raw throws from adapters and turn them into runtime errors.
 *
 * Most failures should use Effect.fail or Effect.try. This protects callers when
 * adapter code throws before it can return a typed AiRuntimeError.
 */
const catchRuntimeDefects = (stream: AiRuntimeEventStream): AiRuntimeEventStream =>
  Stream.catchCauseIf(stream, Cause.hasDies, (cause) =>
    Stream.fail(toRuntimeError(Cause.squash(cause))),
  );

const toRuntimeError = (error: unknown): AiRuntimeError => {
  if (error instanceof AiRuntimeError) return error;
  return new AiRuntimeError(
    RUNTIME_ERROR_CODES.INTERNAL_ERROR,
    error instanceof Error ? error.message : "agent runtime failed",
  );
};
