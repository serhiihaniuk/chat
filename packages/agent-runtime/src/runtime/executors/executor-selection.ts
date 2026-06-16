import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  type ExecutorId,
} from "@side-chat/ai-runtime-contract";
import { createAiSdkToolLoopExecutor } from "./ai-sdk-tool-loop-executor.js";
import type { AgentExecutor } from "./agent-executor.js";

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
      throw new AiRuntimeError(
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
 * Unknown ids fail closed instead of silently falling back to a different
 * orchestration engine.
 */
export const resolveAgentExecutor = (
  catalog: ExecutorCatalog,
  executorId: ExecutorId,
): AgentExecutor => {
  const executor = catalog.byId.get(executorId);
  if (executor) return executor;

  throw new AiRuntimeError(
    RUNTIME_ERROR_CODES.EXECUTOR_UNAVAILABLE,
    `executor ${executorId} is not registered`,
  );
};
