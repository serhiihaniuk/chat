import type { TextStreamPart, ToolSet } from "ai";
import { toJsonObject, type JsonObject } from "@side-chat/shared";
import type { RuntimeTool } from "#tools/runtime-tool";

import {
  RUNTIME_ACTIVITY_KINDS,
  RUNTIME_ACTIVITY_STATUSES,
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  type RuntimeActivitySource,
  type RuntimeActivityStatus,
  type RuntimeEvent,
} from "@side-chat/ai-runtime-contract";
import type { RuntimeProviderRequest } from "../../turn/runtime-provider-request.js";

const AI_SDK_TOOL_PART_TYPES = {
  INPUT_START: "tool-input-start",
  CALL: "tool-call",
  RESULT: "tool-result",
  ERROR: "tool-error",
} as const;

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

/**
 * Identify a stream part that targets a host command rather than a server tool.
 *
 * Host commands are exposed to the model as tools, so they arrive as the same
 * tool stream parts. The runner branches on this so a host-command call becomes a
 * `host_command` activity instead of a `tool` row.
 */
export const isHostCommandToolPart = (
  part: TextStreamPart<ToolSet>,
  hostCommandNames: ReadonlySet<string>,
): boolean => {
  const name = toolPartName(part);
  return name !== undefined && hostCommandNames.has(name);
};

/**
 * Emit one `host_command` activity when the model calls a host command.
 *
 * Only the `tool-call` part carries the full arguments, so that is the single row
 * the widget dispatches (once per `activityId`). Input-start, the synthetic
 * result, and errors are skipped: completion is owned by the host bridge, not the
 * runtime.
 */
export const mapAiSdkHostCommandActivity = (
  request: RuntimeProviderRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
): RuntimeEvent | undefined => {
  if (part.type !== AI_SDK_TOOL_PART_TYPES.CALL) return undefined;
  return {
    type: RUNTIME_EVENT_TYPES.ACTIVITY,
    activityId: part.toolCallId,
    activityKind: RUNTIME_ACTIVITY_KINDS.HOST_COMMAND,
    requestId: request.requestId,
    assistantTurnId: request.assistantTurnId,
    sequence,
    status: RUNTIME_ACTIVITY_STATUSES.RUNNING,
    title: part.title ?? `Run ${part.toolName}`,
    details: {
      hostCommand: {
        commandId: part.toolCallId,
        commandName: part.toolName,
        payload: toJsonObject(part.input),
      },
    },
  };
};

const toolPartName = (part: TextStreamPart<ToolSet>): string | undefined => {
  if (
    part.type === AI_SDK_TOOL_PART_TYPES.INPUT_START ||
    part.type === AI_SDK_TOOL_PART_TYPES.CALL ||
    part.type === AI_SDK_TOOL_PART_TYPES.RESULT ||
    part.type === AI_SDK_TOOL_PART_TYPES.ERROR
  ) {
    return part.toolName;
  }
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
    status: RUNTIME_ACTIVITY_STATUSES.RUNNING,
    toolCallId: part.id,
    toolName: part.toolName,
    input: {},
    title: part.title,
  });

/**
 * Replace the placeholder activity with the completed tool input.
 *
 * At this point the model has produced the JSON arguments but the tool has not
 * finished. Invariant: the runtime keeps the same activity id so the UI updates one row
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
    status: RUNTIME_ACTIVITY_STATUSES.RUNNING,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    title: part.title,
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
    status: part.preliminary
      ? RUNTIME_ACTIVITY_STATUSES.RUNNING
      : RUNTIME_ACTIVITY_STATUSES.COMPLETED,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    result,
    title: part.title,
    sources,
  });
};

/**
 * Show a failed tool row without exposing the thrown value.
 *
 * The UI only needs to know which tool call failed and that it was a tool
 * failure. Detailed provider/tool exceptions stay in the runtime.
 */
const mapToolError = (
  request: RuntimeProviderRequest,
  sequence: number,
  part: AiSdkToolErrorPart,
): RuntimeEvent =>
  createToolActivity({
    request,
    sequence,
    status: RUNTIME_ACTIVITY_STATUSES.FAILED,
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    input: toJsonObject(part.input),
    errorCode: RUNTIME_ERROR_CODES.TOOL_FAILED,
    title: part.title,
  });

type ToolActivityInput = {
  readonly request: RuntimeProviderRequest;
  readonly sequence: number;
  readonly status: RuntimeActivityStatus;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly title?: string | undefined;
  readonly input: JsonObject;
  readonly result?: JsonObject | undefined;
  readonly sources?: readonly RuntimeActivitySource[] | undefined;
  readonly errorCode?: string | undefined;
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
  activityKind: RUNTIME_ACTIVITY_KINDS.TOOL,
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence,
  status,
  title: title ?? `Run ${toolName}`,
  details: {
    tool: createToolActivityDetails({ toolCallId, toolName, input, result, sources, errorCode }),
  },
});

const createToolActivityDetails = ({
  errorCode,
  input,
  result,
  sources,
  toolCallId,
  toolName,
}: Pick<
  ToolActivityInput,
  "errorCode" | "input" | "result" | "sources" | "toolCallId" | "toolName"
>) => ({
  toolCallId,
  toolName,
  input,
  result,
  sources: hasSources(sources) ? sources : undefined,
  errorCode,
});

const hasSources = (
  sources: readonly RuntimeActivitySource[] | undefined,
): sources is readonly RuntimeActivitySource[] => Boolean(sources && sources.length > 0);
