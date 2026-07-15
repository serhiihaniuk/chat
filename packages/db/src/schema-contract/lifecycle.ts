export const SCHEMA_ENTITY_TYPES = [
  "conversation",
  "message",
  "assistant_turn",
  "context_snapshot",
  "usage_record",
  "tool_invocation",
  "client_tool_dispatch",
  "tool_approval",
  "host_command_result",
  "audit_event",
] as const;

export type SchemaEntityType = (typeof SCHEMA_ENTITY_TYPES)[number];

export const CONVERSATION_STATUSES = ["active", "archived", "reset"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ASSISTANT_TURN_STATUSES = [
  // The product aggregate has not committed a terminal. Workflow status, not
  // this value, determines whether execution is actually live.
  "open",
  "completed",
  // Every failure mode collapses to one status; the safe error code carries the
  // detail. v7 drops the old app's per-cause statuses (provider/tool/persistence
  // failures, timeouts) — the reaper that set some of them is gone.
  "failed",
  // The user or system cancelled the turn (replaces the old `user_aborted`).
  "cancelled",
  // A safety stop: the provider filtered the turn before a usable answer. Kept
  // distinct from `failed` so history can tell a filtered turn from an outage.
  "blocked",
] as const;
export type AssistantTurnStatus = (typeof ASSISTANT_TURN_STATUSES)[number];

export const TOOL_INVOCATION_STATUSES = [
  "running",
  "completed",
  "failed",
  "cancelled",
  "skipped",
] as const;
export type ToolInvocationStatus = (typeof TOOL_INVOCATION_STATUSES)[number];

/** Durable lifecycle of one browser-executed client-tool call. */
export const CLIENT_TOOL_DISPATCH_STATES = [
  "dispatched",
  "settled",
  "failed",
  "timed_out",
  "late",
  "aborted",
] as const;
export type ClientToolDispatchState = (typeof CLIENT_TOOL_DISPATCH_STATES)[number];

/** Durable authorization state for one gated tool call. */
export const TOOL_APPROVAL_STATES = ["requested", "approved", "denied", "expired"] as const;
export type ToolApprovalState = (typeof TOOL_APPROVAL_STATES)[number];

export const HOST_COMMAND_RESULT_STATUSES = [
  "emitted",
  "applied",
  "rejected",
  "unsupported",
  "failed",
  "timed_out",
] as const;
export type HostCommandResultStatus = (typeof HOST_COMMAND_RESULT_STATUSES)[number];

/**
 * Postgres channel that signals a saved host-command result.
 *
 * Any instance may receive the browser request, but only the owner of the paused
 * tool loop can settle it. The notification is only a wake-up signal; the saved
 * result row is the source of truth, so a missed notification affects latency,
 * not correctness (ADR 0009).
 */
export const HOST_COMMAND_RESULT_NOTIFY_CHANNEL = "host_command_result";

/**
 * Identity-only assistant-turn lifecycle notifications for subject activity SSE.
 * The status write and notification commit together, so a reconnecting client can
 * repair missed hints from the durable active-turn snapshot.
 */
export const TURN_ACTIVITY_NOTIFY_CHANNEL = "turn_activity";
