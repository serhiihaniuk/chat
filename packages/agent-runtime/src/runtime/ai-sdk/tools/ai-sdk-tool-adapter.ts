import { jsonSchema, tool as createAiTool, type ToolExecutionOptions, type ToolSet } from "ai";
import { optionalField, type JsonObject } from "@side-chat/shared";
import type { RuntimeTool, RuntimeToolContext } from "#tools/runtime-tool";

import type { RuntimeProviderRequest } from "../../contract/runtime-request.js";
import { toJsonObject } from "./json-value.js";
import { executeRuntimeToolForAiSdk } from "./runtime-tool-executor.js";

/**
 * Convert the selected app tools to the shape AI SDK expects.
 *
 * The app still owns what each tool does. This wrapper only adds the current
 * turn ids before the tool runs.
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
 * Give the tool the ids it needs for logs, auth checks, cancellation, and UI rows.
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
