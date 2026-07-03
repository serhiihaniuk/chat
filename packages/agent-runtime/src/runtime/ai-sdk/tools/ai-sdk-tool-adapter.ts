import { jsonSchema, tool as createAiTool, type ToolExecutionOptions, type ToolSet } from "ai";
import {
  AiRuntimeError,
  RUNTIME_ERROR_CODES,
  type AiHostCommandDescriptor,
} from "@side-chat/ai-runtime-contract";
import type { JsonObject } from "@side-chat/shared";
import type { HostCommandResolver, RuntimeTool, RuntimeToolContext } from "#tools/runtime-tool";

import type { RuntimeProviderRequest } from "../../turn/runtime-provider-request.js";
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

/**
 * Merge the runtime tool set with the host-command tool set for one turn.
 *
 * A name shared across the two kinds is a configuration error, not a silent
 * override: it would let a browser-declared host command shadow a registered
 * runtime tool (and misclassify every later stream part with that name). Reject
 * the turn with a typed `tool_conflict` instead.
 */
export const mergeToolSets = (
  base: ToolSet | undefined,
  extra: ToolSet | undefined,
): ToolSet | undefined => {
  if (!base) return extra;
  if (!extra) return base;
  const conflict = Object.keys(extra).find((name) => Object.hasOwn(base, name));
  if (conflict !== undefined) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.TOOL_CONFLICT,
      `A host command and a runtime tool both use the name "${conflict}".`,
    );
  }
  return { ...base, ...extra };
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
 * Tool result returned to the model when no resolver is wired.
 *
 * Round-trip host commands need a {@link HostCommandResolver} to await the
 * browser's result. Without one the tool cannot run, so the model is told it is
 * unsupported rather than left hanging.
 */
const HOST_COMMAND_UNRESOLVED_RESULT: JsonObject = {
  status: "unsupported",
  detail: "Host command resolution is not configured on this runtime.",
};

/**
 * Expose the host-declared commands for this turn as model-callable tools.
 *
 * A UI tool runs in the browser, so `execute` does not run server logic: it asks
 * the {@link HostCommandResolver} for the browser's result and returns it to the
 * model, exactly like a backend tool returns its result. The stream mapper turns
 * the call into a `host_command` activity the browser dispatches.
 */
export const createHostCommandToolSet = (
  hostCommands: readonly AiHostCommandDescriptor[] | undefined,
  request: RuntimeProviderRequest,
  resolver: HostCommandResolver | undefined,
): ToolSet | undefined => {
  if (!hostCommands || hostCommands.length === 0) return undefined;
  return Object.fromEntries(
    hostCommands.map((command) => [
      command.commandName,
      toHostCommandTool(command, request, resolver),
    ]),
  ) as ToolSet;
};

/** Names of the host commands exposed this turn, for the stream mapper's branch. */
export const hostCommandNameSet = (
  hostCommands: readonly AiHostCommandDescriptor[] | undefined,
): ReadonlySet<string> => new Set((hostCommands ?? []).map((command) => command.commandName));

const toHostCommandTool = (
  command: AiHostCommandDescriptor,
  request: RuntimeProviderRequest,
  resolver: HostCommandResolver | undefined,
) =>
  createAiTool<JsonObject, JsonObject>({
    description: command.description,
    inputSchema: jsonSchema<JsonObject>(command.inputSchema),
    execute: (input, options) =>
      resolver
        ? resolver.awaitResult({
            assistantTurnId: request.assistantTurnId,
            commandId: options.toolCallId,
            commandName: command.commandName,
            payload: toJsonObject(input),
            abortSignal: options.abortSignal,
          })
        : Promise.resolve(HOST_COMMAND_UNRESOLVED_RESULT),
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
  scope: request.toolScope,
  modelId: request.modelId,
  toolName: runtimeTool.name,
  toolCallId: options.toolCallId,
  providerId: request.providerId,
  abortSignal: options.abortSignal,
});
