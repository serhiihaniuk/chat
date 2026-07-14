import { toJsonObject, type JsonValue } from "@side-chat/shared";
import { SIDE_CHAT_ERROR_CODES } from "@side-chat/stream-profile";

import {
  SIDE_CHAT_ACTIVITY_KINDS,
  SIDE_CHAT_ACTIVITY_STATUSES,
  type SideChatActivityItem,
  type SideChatActivityStatus,
} from "#entities/activity";

import type {
  WorkflowTimelineItem,
  WorkflowTimelineToolState,
} from "../../model/native-message-projection.js";

type WorkflowActivityItem = Extract<WorkflowTimelineItem, { kind: "reasoning" | "tool" }>;

/** Normalize native timeline state before host rendering code can observe it. */
export function toWorkflowSideChatActivityItem(item: WorkflowActivityItem): SideChatActivityItem {
  if (item.kind === "reasoning") {
    return {
      id: item.id,
      kind: SIDE_CHAT_ACTIVITY_KINDS.REASONING,
      status: item.streaming
        ? SIDE_CHAT_ACTIVITY_STATUSES.RUNNING
        : SIDE_CHAT_ACTIVITY_STATUSES.COMPLETED,
      title: item.text,
    };
  }

  return {
    id: item.id,
    kind: SIDE_CHAT_ACTIVITY_KINDS.TOOL,
    status: workflowToolStatus(item.state),
    title: item.name,
    tool: {
      toolCallId: item.toolCallId,
      toolName: item.toolName,
      input: normalizeJsonValue(item.input),
      result: normalizeJsonValue(item.output),
      errorCode: item.state === "output-error" ? SIDE_CHAT_ERROR_CODES.TOOL_FAILED : undefined,
    },
  };
}

function workflowToolStatus(state: WorkflowTimelineToolState): SideChatActivityStatus {
  if (state === "output-available") return SIDE_CHAT_ACTIVITY_STATUSES.COMPLETED;
  if (state === "output-error" || state === "output-denied") {
    return SIDE_CHAT_ACTIVITY_STATUSES.FAILED;
  }
  return SIDE_CHAT_ACTIVITY_STATUSES.RUNNING;
}

function normalizeJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  return toJsonObject({ value })["value"] ?? null;
}
