import { AgentRuntimeError } from "../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "../contract/runtime-event.js";
import type { AgentRuntimeRequest } from "../contract/runtime-request.js";
import { createAiSdkToolLoopExecutor } from "./ai-sdk-tool-loop-executor.js";
import { DEFAULT_AGENT_EXECUTOR_ID, type AgentExecutor } from "./agent-executor.js";

export type ExecutorCatalog = {
  readonly executors: readonly AgentExecutor[];
  readonly byId: ReadonlyMap<string, AgentExecutor>;
};

export const createExecutorCatalog = (
  executors: readonly AgentExecutor[] | undefined,
): ExecutorCatalog => {
  const allExecutors = [createAiSdkToolLoopExecutor(), ...(executors ?? [])];
  const byId = new Map<string, AgentExecutor>();

  for (const executor of allExecutors) {
    if (byId.has(executor.executorId)) {
      throw new AgentRuntimeError(
        RUNTIME_ERROR_CODES.EXECUTOR_UNAVAILABLE,
        `duplicate executor ${executor.executorId}`,
      );
    }
    byId.set(executor.executorId, executor);
  }

  return { executors: allExecutors, byId };
};

/**
 * Resolve the executor selected by core before any executor starts streaming.
 *
 * Missing ids use the runtime default. Unknown ids fail closed instead of
 * silently falling back to a different orchestration engine.
 */
export const resolveAgentExecutor = (
  catalog: ExecutorCatalog,
  request: AgentRuntimeRequest,
): AgentExecutor => {
  const executorId = request.executorId ?? DEFAULT_AGENT_EXECUTOR_ID;
  const executor = catalog.byId.get(executorId);
  if (executor) return executor;

  throw new AgentRuntimeError(
    RUNTIME_ERROR_CODES.EXECUTOR_UNAVAILABLE,
    `executor ${executorId} is not registered`,
  );
};
