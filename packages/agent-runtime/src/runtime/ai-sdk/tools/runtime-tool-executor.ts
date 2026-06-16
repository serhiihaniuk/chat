import { Effect, Exit, Option } from "effect";
import type { JsonObject } from "@side-chat/shared";
import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";
import type { RuntimeTool, RuntimeToolContext, RuntimeToolEffect } from "#tools/runtime-tool";

/**
 * Run an app-owned tool when AI SDK calls it.
 *
 * Tools are written as Effect programs so timeouts, cancellation, and typed
 * failures stay explicit. AI SDK receives the Promise wrapper it expects here.
 */
export const executeRuntimeToolForAiSdk = async (
  runtimeTool: RuntimeTool,
  input: JsonObject,
  context: RuntimeToolContext,
): Promise<JsonObject> => {
  const execution = withRuntimeToolTimeout(runtimeTool, runtimeTool.execute(input, context));
  const exit = await Effect.runPromiseExit(
    execution,
    context.abortSignal ? { signal: context.abortSignal } : undefined,
  );

  if (Exit.isSuccess(exit)) return exit.value;
  throw runtimeToolFailure(runtimeTool, context, exit);
};

/**
 * Enforce a tool's declared timeout.
 *
 * If a tool says it has a timeout, runtime owns that timer and reports timeout
 * as AiRuntimeError, not as a scheduler-specific exception.
 */
const withRuntimeToolTimeout = (
  runtimeTool: RuntimeTool,
  execution: RuntimeToolEffect,
): RuntimeToolEffect => {
  if (!runtimeTool.timeoutMs) return execution;

  return execution.pipe(
    Effect.timeoutOrElse({
      duration: runtimeTool.timeoutMs,
      orElse: () =>
        Effect.fail(
          new AiRuntimeError(
            RUNTIME_ERROR_CODES.TIMEOUT,
            `${runtimeTool.name} timed out after ${runtimeTool.timeoutMs}ms.`,
          ),
        ),
    }),
  );
};

const runtimeToolFailure = (
  runtimeTool: RuntimeTool,
  context: RuntimeToolContext,
  exit: Exit.Exit<JsonObject, AiRuntimeError>,
): AiRuntimeError => {
  const typedError = Option.getOrUndefined(Exit.findErrorOption(exit));
  if (typedError) return typedError;

  if (context.abortSignal?.aborted) {
    return new AiRuntimeError(RUNTIME_ERROR_CODES.ABORTED, `${runtimeTool.name} was aborted.`);
  }

  return new AiRuntimeError(
    RUNTIME_ERROR_CODES.TOOL_FAILED,
    `${runtimeTool.name} failed before returning a typed tool error.`,
  );
};
