import type { TextStreamPart, ToolSet } from "ai";
import {
  type ActivitySource,
  type ActivityKind,
  type ActivityStatus,
  type JsonObject,
  type ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import type { RuntimeTool } from "#tools/runtime-tool";

import {
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type RuntimeEvent,
} from "../contract/runtime-event.js";
import type { RuntimeProviderRequest } from "../contract/runtime-request.js";
import { toJsonObject } from "./json-value.js";

const AI_SDK_TOOL_PART_TYPES = {
  INPUT_START: "tool-input-start",
  CALL: "tool-call",
  RESULT: "tool-result",
  ERROR: "tool-error",
} as const;

const ACTIVITY_KIND_TOOL = "tool" satisfies ActivityKind;
const ACTIVITY_STATUS_RUNNING = "running" satisfies ActivityStatus;
const ACTIVITY_STATUS_COMPLETED = "completed" satisfies ActivityStatus;
const ACTIVITY_STATUS_FAILED = "failed" satisfies ActivityStatus;

/**
 * Keep a lookup from streamed tool names back to the app-owned RuntimeTool.
 *
 * AI SDK stream parts only contain the selected tool name and payloads. The
 * runtime needs the original RuntimeTool when it wants optional metadata such
 * as display sources derived from the normalized tool result.
 */
export const createRuntimeToolLookup = (
  runtimeTools: readonly RuntimeTool[] | undefined,
): ReadonlyMap<string, RuntimeTool> =>
  new Map((runtimeTools ?? []).map((runtimeTool) => [runtimeTool.name, runtimeTool]));

/**
 * Map AI SDK tool stream parts to one stable runtime activity row.
 *
 * AI SDK emits separate parts as input starts, input becomes known, execution
 * returns, or execution fails. The product timeline wants those updates to
 * target the same activity id, so the user sees one evolving tool row.
 */
export const mapAiSdkToolActivity = (
  request: RuntimeProviderRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
  runtimeTools: ReadonlyMap<string, RuntimeTool>,
): RuntimeEvent | undefined => {
  if (part.type === AI_SDK_TOOL_PART_TYPES.INPUT_START)
    return mapToolInputStart(request, sequence, part);
  if (part.type === AI_SDK_TOOL_PART_TYPES.CALL) return mapToolCall(request, sequence, part);
  if (part.type === AI_SDK_TOOL_PART_TYPES.RESULT)
    return mapToolResult(request, sequence, part, runtimeTools);
  if (part.type === AI_SDK_TOOL_PART_TYPES.ERROR) return mapToolError(request, sequence, part);
  return undefined;
};

type AiSdkToolInputStartPart = Extract<
  TextStreamPart<ToolSet>,
  { type: typeof AI_SDK_TOOL_PART_TYPES.INPUT_START }
>;
type AiSdkToolCallPart = Extract<
  TextStreamPart<ToolSet>,
  { type: typeof AI_SDK_TOOL_PART_TYPES.CALL }
>;
type AiSdkToolResultPart = Extract<
  TextStreamPart<ToolSet>,
  { type: typeof AI_SDK_TOOL_PART_TYPES.RESULT }
>;
type AiSdkToolErrorPart = Extract<
  TextStreamPart<ToolSet>,
  { type: typeof AI_SDK_TOOL_PART_TYPES.ERROR }
>;

/**
 * Show that the model chose a tool before the full input is available.
 *
 * This makes the activity timeline feel immediate during streaming. The input
 * is intentionally empty here because AI SDK has only announced the tool call,
 * not the completed JSON arguments.
 */
const mapToolInputStart = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolInputStartPart,
): RuntimeEvent =>
  createToolActivity({
    request,
    sequence,
    status: ACTIVITY_STATUS_RUNNING,
    toolCallId: part.id,
    toolName: part.toolName,
    input: {},
    ...titleProp(part.title),
  });

/**
 * Replace the placeholder activity with the completed tool input.
 *
 * At this point the model has produced the JSON arguments but the tool has not
 * finished. The runtime keeps the same activity id so the UI updates one row
 * instead of rendering a separate "input known" row.
 */
const mapToolCall = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolCallPart,
): RuntimeEvent =>
  createToolActivity({
    request,
    sequence,
    status: ACTIVITY_STATUS_RUNNING,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    ...titleProp(part.title),
  });

/**
 * Mark the tool activity as completed and attach display sources if present.
 *
 * Tools may expose sources after seeing their normalized result. That keeps
 * source extraction inside the app-owned tool implementation while this mapper
 * only copies protocol-safe source metadata onto the runtime event.
 */
const mapToolResult = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolResultPart,
  runtimeTools: ReadonlyMap<string, RuntimeTool>,
): RuntimeEvent => {
  const result = toJsonObject(part.output);
  const sources = runtimeTools.get(part.toolName)?.readSources?.(result);
  return createToolActivity({
    request,
    sequence,
    status: part.preliminary ? ACTIVITY_STATUS_RUNNING : ACTIVITY_STATUS_COMPLETED,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    result,
    ...titleProp(part.title),
    ...(sources ? { sources } : {}),
  });
};

/**
 * Convert a provider/tool execution failure into the runtime activity contract.
 *
 * The detailed thrown value stays private to the adapter boundary. Downstream
 * code only needs a stable failed activity with a typed protocol error code.
 */
const mapToolError = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolErrorPart,
): RuntimeEvent =>
  createToolActivity({
    request,
    sequence,
    status: ACTIVITY_STATUS_FAILED,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    errorCode: RUNTIME_ERROR_CODES.TOOL_FAILED,
    ...titleProp(part.title),
  });

type ToolActivityInput = {
  readonly request: RuntimeProviderRequest;
  readonly sequence: number;
  readonly status: ActivityStatus;
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
  type: RUNTIME_EVENT_TYPES.ACTIVITY,
  activityId: toolCallId,
  activityKind: ACTIVITY_KIND_TOOL,
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
