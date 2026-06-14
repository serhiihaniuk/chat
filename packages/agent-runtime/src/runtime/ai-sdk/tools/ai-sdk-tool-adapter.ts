import { jsonSchema, tool as createAiTool, type ToolExecutionOptions, type ToolSet } from "ai";
import { optionalField, type JsonObject } from "@side-chat/shared";
import type { RuntimeTool, RuntimeToolContext } from "#tools/runtime-tool";

import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";
import { toJsonObject } from "./json-value.js";
import { executeRuntimeToolForAiSdk } from "./runtime-tool-executor.js";

/**
 * Convert app-owned RuntimeTool values into the AI SDK tool shape.
 *
 * The consuming app owns what a tool does. This adapter only teaches AI SDK how
 * to call that tool and how to pass request context such as request id, turn id,
 * model id, provider id, and tool call id into the Effect-based tool function.
 */
export const createAiSdkToolSet = (
  runtimeTools: readonly RuntimeTool[] | undefined,
  request: RuntimeProviderRequest,
): ToolSet | undefined => {
  if (!runtimeTools || runtimeTools.length === 0) return undefined;

  return Object.fromEntries(
    runtimeTools.map((runtimeTool) => [runtimeTool.name, toAiSdkTool(runtimeTool, request)]),
  ) as ToolSet;
};

const toAiSdkTool = (runtimeTool: RuntimeTool, request: RuntimeProviderRequest) =>
  createAiTool<JsonObject, JsonObject>({
    description: runtimeTool.description,
    inputSchema: jsonSchema<JsonObject>(runtimeTool.inputSchema),
    execute: async (input, options) =>
      executeRuntimeToolForAiSdk(
        runtimeTool,
        toJsonObject(input),
        createRuntimeToolContext(runtimeTool, request, options),
      ),
  });

/**
 * RuntimeToolContext is the tool's view of the current agent turn.
 *
 * Tools should not have to parse AI SDK messages or provider-native metadata to
 * know where they are running. The adapter gives them the normalized ids they
 * need for logging, authorization, cancellation, and activity correlation.
 */
const createRuntimeToolContext = (
  runtimeTool: RuntimeTool,
  request: RuntimeProviderRequest,
  options: ToolExecutionOptions,
): RuntimeToolContext => ({
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  ...optionalField("scope", request.toolScope),
  modelId: request.modelId,
  toolName: runtimeTool.name,
  toolCallId: options.toolCallId,
  ...optionalField("providerId", request.providerId),
  ...optionalField("abortSignal", options.abortSignal),
});
