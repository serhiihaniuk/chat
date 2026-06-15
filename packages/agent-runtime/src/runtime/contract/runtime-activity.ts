import type { JsonObject } from "@side-chat/shared";
import type { ToolCallId } from "./ids/runtime-ids.js";

export const RUNTIME_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
} as const;

export type RuntimeActivityKind =
  (typeof RUNTIME_ACTIVITY_KINDS)[keyof typeof RUNTIME_ACTIVITY_KINDS];

/**
 * Statuses for one progress row.
 *
 * The same `activityId` may move from running to completed or failed. That
 * means "update this row", not "render a new assistant message".
 */
export const RUNTIME_ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type RuntimeActivityStatus =
  (typeof RUNTIME_ACTIVITY_STATUSES)[keyof typeof RUNTIME_ACTIVITY_STATUSES];

export type RuntimeActivitySource = {
  readonly label: string;
  readonly url?: string;
};

export type RuntimeActivityImage = {
  readonly alt: string;
  readonly caption?: string;
  readonly mediaType: string;
  readonly data: string;
};

/**
 * Visible state for one tool call.
 *
 * `toolCallId` is the row identity while input, result, or error information
 * arrives. Tool exceptions are reduced to `errorCode`; callers should not
 * expect a thrown value here.
 */
export type RuntimeActivityToolDetails = {
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly sources?: readonly RuntimeActivitySource[];
  readonly errorCode?: string;
};

/**
 * Optional details attached to an activity row.
 *
 * Tool input and result stay with the activity that produced them. They do not
 * become separate chat messages.
 */
export type RuntimeActivityDetails = {
  readonly sources?: readonly RuntimeActivitySource[];
  readonly images?: readonly RuntimeActivityImage[];
  readonly tool?: RuntimeActivityToolDetails;
};
