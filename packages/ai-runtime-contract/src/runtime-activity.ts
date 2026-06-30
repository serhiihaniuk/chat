import type { JsonObject } from "@side-chat/shared";
import type { ToolCallId } from "./runtime-ids.js";

/**
 * Visible runtime activity rows shared across the core-to-runtime contract.
 *
 * An activity row is the model's visible work (progress, reasoning summary, or a
 * tool call), updated in place by `activityId`. These shapes are kept apart from
 * the streamed event union so the event file stays focused on lifecycle.
 */

export const RUNTIME_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
  HOST_COMMAND: "host_command",
} as const;

export type RuntimeActivityKind =
  (typeof RUNTIME_ACTIVITY_KINDS)[keyof typeof RUNTIME_ACTIVITY_KINDS];

/**
 * Statuses for one visible runtime activity row.
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
  readonly url?: string | undefined;
};

export type RuntimeActivityImage = {
  readonly alt: string;
  readonly caption?: string | undefined;
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
  readonly input?: JsonObject | undefined;
  readonly result?: JsonObject | undefined;
  readonly sources?: readonly RuntimeActivitySource[] | undefined;
  readonly errorCode?: string | undefined;
};

/**
 * Visible state for one host command the model asked the browser to run.
 *
 * The runtime only emits the request (id, name, args). The browser performs the
 * action and folds its result into the client timeline; the durable runtime log
 * keeps just this dispatch row.
 */
export type RuntimeActivityHostCommandDetails = {
  readonly commandId: string;
  readonly commandName: string;
  readonly payload: JsonObject;
};

/**
 * Optional details attached to an activity row.
 *
 * Tool input and result stay with the activity that produced them. They do not
 * become separate chat messages.
 */
export type RuntimeActivityDetails = {
  readonly sources?: readonly RuntimeActivitySource[] | undefined;
  readonly images?: readonly RuntimeActivityImage[] | undefined;
  readonly tool?: RuntimeActivityToolDetails | undefined;
  readonly hostCommand?: RuntimeActivityHostCommandDetails | undefined;
};
