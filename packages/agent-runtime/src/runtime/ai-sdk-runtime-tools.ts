import { jsonSchema, tool as createAiTool, type TextStreamPart, type ToolSet } from "ai";
import type {
  ActivitySource,
  JsonObject,
  JsonValue,
  ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import type { RuntimeTool } from "#tools/tool-registry";

import type { RuntimeEvent } from "../events.js";
import type { RuntimeRequest } from "../provider.js";

export const createAiSdkToolSet = (
  runtimeTools: readonly RuntimeTool[] | undefined,
): ToolSet | undefined => {
  if (!runtimeTools || runtimeTools.length === 0) return undefined;

  return Object.fromEntries(
    runtimeTools.map((runtimeTool) => [runtimeTool.name, toAiSdkTool(runtimeTool)]),
  ) as ToolSet;
};

export const createRuntimeToolLookup = (
  runtimeTools: readonly RuntimeTool[] | undefined,
): ReadonlyMap<string, RuntimeTool> =>
  new Map((runtimeTools ?? []).map((runtimeTool) => [runtimeTool.name, runtimeTool]));

export const mapAiSdkToolActivity = (
  request: RuntimeRequest,
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

const toAiSdkTool = (runtimeTool: RuntimeTool) =>
  createAiTool<JsonObject, JsonObject>({
    description: runtimeTool.description,
    inputSchema: jsonSchema<JsonObject>(runtimeTool.inputSchema),
    execute: async (input) => runtimeTool.run(toJsonObject(input)),
  });

type ToolActivityInput = {
  readonly request: RuntimeRequest;
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
