import { Effect, Exit, Option } from "effect";
import type { JsonObject } from "@side-chat/chat-protocol";
import type { RuntimeTool, RuntimeToolContext, RuntimeToolEffect } from "#tools/runtime-tool";

import { AgentRuntimeError } from "../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "../contract/runtime-event.js";

/**
 * Execute one app-owned RuntimeTool for an AI SDK tool callback.
 *
 * AI SDK expects a Promise-returning callback, while Side Chat tools expose an
 * Effect program so timeout, cancellation, dependencies, and typed failures
 * stay explicit at the runtime seam. This adapter is the one place where that
 * Effect program is interpreted back into a Promise for AI SDK.
 */
export const executeRuntimeToolForAiSdk = async (
  runtimeTool: RuntimeTool,
  input: JsonObject,
  context: RuntimeToolContext,
): Promise<JsonObject> => {
  const execution = withRuntimeToolTimeout(runtimeTool, runtimeTool.execute(input, context));
  const exit = await Effect.runPromiseExit(execution, {
    ...(context.abortSignal ? { signal: context.abortSignal } : {}),
  });

  if (Exit.isSuccess(exit)) return exit.value;
  throw runtimeToolFailure(runtimeTool, context, exit);
};

/**
 * Apply the tool-level timeout declared by the app-owned tool.
 *
 * `RuntimeTool.timeoutMs` is a protocol promise: if a tool declares it, the
 * runtime is responsible for enforcing it. The timeout becomes a typed
 * AgentRuntimeError so downstream stream mapping can produce stable error
 * events instead of leaking scheduler-specific exceptions.
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
          new AgentRuntimeError(
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
  exit: Exit.Exit<JsonObject, AgentRuntimeError>,
): AgentRuntimeError => {
  const typedError = Option.getOrUndefined(Exit.findErrorOption(exit));
  if (typedError) return typedError;

  if (context.abortSignal?.aborted) {
    return new AgentRuntimeError(RUNTIME_ERROR_CODES.ABORTED, `${runtimeTool.name} was aborted.`);
  }

  return new AgentRuntimeError(
    RUNTIME_ERROR_CODES.TOOL_FAILED,
    `${runtimeTool.name} failed before returning a typed tool error.`,
  );
};
