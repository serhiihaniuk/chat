import { Effect } from "effect";
import {
  jsonSchema,
  tool as createAiTool,
  type TextStreamPart,
  type ToolExecutionOptions,
  type ToolSet,
} from "ai";
import type {
  ActivitySource,
  JsonObject,
  JsonValue,
  ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import type { RuntimeTool, RuntimeToolContext } from "#tools/runtime-tool";

import type { RuntimeEvent } from "../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../contract/runtime-request.js";

/**
 * Converts app-owned RuntimeTool values into AI SDK tools.
 *
 * Tool execution still goes through the Effect-based RuntimeTool interface;
 * the AI SDK shape is contained inside this runtime adapter folder.
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

export const createRuntimeToolLookup = (
  runtimeTools: readonly RuntimeTool[] | undefined,
): ReadonlyMap<string, RuntimeTool> =>
  new Map((runtimeTools ?? []).map((runtimeTool) => [runtimeTool.name, runtimeTool]));

export const mapAiSdkToolActivity = (
  request: RuntimeProviderRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
  runtimeTools: ReadonlyMap<string, RuntimeTool>,
): RuntimeEvent | undefined => {
  if (part.type === "tool-input-start") {
    return createToolActivity({
      request,
      sequence,
      status: "running",
      toolCallId: part.id,
      toolName: part.toolName,
      input: {},
      ...titleProp(part.title),
    });
  }

  if (part.type === "tool-call") {
    return createToolActivity({
      request,
      sequence,
      status: "running",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: toJsonObject(part.input),
      ...titleProp(part.title),
    });
  }

  if (part.type === "tool-result") {
    const result = toJsonObject(part.output);
    const sources = runtimeTools.get(part.toolName)?.readSources?.(result);
    return createToolActivity({
      request,
      sequence,
      status: part.preliminary ? "running" : "completed",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: toJsonObject(part.input),
      result,
      ...titleProp(part.title),
      ...(sources ? { sources } : {}),
    });
  }

  if (part.type === "tool-error") {
    return createToolActivity({
      request,
      sequence,
      status: "failed",
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: toJsonObject(part.input),
      errorCode: "tool_failed",
      ...titleProp(part.title),
    });
  }

  return undefined;
};

const toAiSdkTool = (runtimeTool: RuntimeTool, request: RuntimeProviderRequest) =>
  createAiTool<JsonObject, JsonObject>({
    description: runtimeTool.description,
    inputSchema: jsonSchema<JsonObject>(runtimeTool.inputSchema),
    execute: async (input, options) =>
      Effect.runPromise(
        runtimeTool.execute(
          toJsonObject(input),
          createRuntimeToolContext(runtimeTool, request, options),
        ),
      ),
  });

const createRuntimeToolContext = (
  runtimeTool: RuntimeTool,
  request: RuntimeProviderRequest,
  options: ToolExecutionOptions,
): RuntimeToolContext => ({
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  modelId: request.modelId,
  toolName: runtimeTool.name,
  toolCallId: options.toolCallId,
  ...(request.providerId ? { providerId: request.providerId } : {}),
  ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
});

type ToolActivityInput = {
  readonly request: RuntimeProviderRequest;
  readonly sequence: number;
  readonly status: "running" | "completed" | "failed";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly title?: string;
  readonly input: JsonObject;
  readonly result?: JsonObject;
  readonly sources?: readonly ActivitySource[];
  readonly errorCode?: ProtocolErrorCode;
};

const createToolActivity = ({
  errorCode,
  input,
  request,
  result,
  sequence,
  sources,
  status,
  title,
  toolCallId,
  toolName,
}: ToolActivityInput): RuntimeEvent => ({
  type: "runtime.activity",
  activityId: toolCallId,
  activityKind: "tool",
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence,
  status,
  title: title ?? `Run ${toolName}`,
  details: {
    tool: {
      toolCallId,
      toolName,
      input,
      ...(result ? { result } : {}),
      ...(sources && sources.length > 0 ? { sources } : {}),
      ...(errorCode ? { errorCode } : {}),
    },
  },
});

const titleProp = (title: string | undefined): { readonly title?: string } =>
  title ? { title } : {};

const toJsonObject = (value: unknown): JsonObject => {
  if (!isRecord(value)) return { value: toJsonValue(value) };

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      entry === undefined ? [] : [[key, toJsonValue(entry)]],
    ),
  ) as JsonObject;
};

const toJsonValue = (value: unknown): JsonValue => {
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));
  if (isRecord(value)) return toJsonObject(value);
  return toJsonScalar(value);
};

const toJsonScalar = (value: unknown): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? null;
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
