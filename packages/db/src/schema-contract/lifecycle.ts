export const SCHEMA_ENTITY_TYPES = [
  "conversation",
  "message",
  "assistant_turn",
  "context_snapshot",
  "usage_record",
  "tool_invocation",
  "host_command_result",
  "audit_event",
] as const;

export type SchemaEntityType = (typeof SCHEMA_ENTITY_TYPES)[number];

export const CONVERSATION_STATUSES = ["active", "archived", "reset"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_ROLES = ["user", "assistant", "system", "tool"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const ASSISTANT_TURN_STATUSES = [
  "running",
  "completed",
  // A safety stop: the turn was blocked before a usable answer. Distinct from
  // provider_failed so audits can tell a filtered turn from a provider outage.
  "blocked",
  "user_aborted",
  "timed_out",
  "provider_failed",
  "tool_failed",
  "persistence_failed",
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
 * Postgres channel that signals a saved cancel request.
 *
 * Any instance may receive it, but only the owner of the generation fiber can
 * interrupt that fiber. The database row is the source of truth, so a missed
 * notification is recovered by the reaper.
 */
export const TURN_CANCEL_NOTIFY_CHANNEL = "turn_cancel";

/**
 * Postgres channel for subject-scoped turn lifecycle updates.
 *
 * The status write and notification happen in one transaction. The payload has
 * the full scope, so the activity dispatcher can update every conversation in the
 * subject's sidebar without another database read.
 */
export const TURN_ACTIVITY_NOTIFY_CHANNEL = "turn_activity";

/**
 * Postgres channel that signals a saved host-command result.
 *
 * Any instance may receive the browser request, but only the owner of the paused
 * tool loop can settle it. The notification is only a wake-up signal; the saved
 * result row is the source of truth, so a missed notification affects latency,
 * not correctness (ADR 0009).
 */
export const HOST_COMMAND_RESULT_NOTIFY_CHANNEL = "host_command_result";
