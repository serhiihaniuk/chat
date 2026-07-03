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
 * Postgres `LISTEN/NOTIFY` channel a durable cancel intent signals on.
 *
 * A cancel can land on any instance, but only the instance that owns the live
 * generation fiber can interrupt it. `requestTurnCancellation` writes the durable
 * intent and notifies this channel in one transaction; every instance listens,
 * and the owning one interrupts its fiber while non-owners no-op. The payload is
 * just `{ assistantTurnId }` — the durable `cancel_requested_at` column is the
 * source of truth, so a missed signal still terminalizes via the reaper.
 */
export const TURN_CANCEL_NOTIFY_CHANNEL = "turn_cancel";

/**
 * Postgres `LISTEN/NOTIFY` channel for subject-scoped turn lifecycle.
 *
 * A turn becoming `running` (start) or reaching a terminal status (finish) signals
 * this channel in the same transaction as the status write, so the per-instance
 * activity dispatcher can push a live "generating" indicator to every conversation
 * in a subject's sidebar — even chats the user is not viewing. The payload carries
 * the full scope `{ workspaceId, subjectId, conversationId, assistantTurnId, status }`
 * so the dispatcher fans out by subject without a per-signal read.
 */
export const TURN_ACTIVITY_NOTIFY_CHANNEL = "turn_activity";

/**
 * Postgres `LISTEN/NOTIFY` channel a durable host-command result signals on.
 *
 * A browser can POST a host-command result to any instance, but only the
 * instance that owns the paused tool loop can settle the awaiting promise. The
 * result route persists the browser's result and notifies this channel in one
 * transaction; every instance listens, the owner reads the persisted row and
 * settles, non-owners no-op. The payload is `{ assistantTurnId, commandId }` —
 * a poke, never the result body — and the durable `host_command_results` row is
 * the source of truth, so a missed signal only costs the owner's low-frequency
 * result poll a couple of seconds, never correctness (ADR 0009).
 */
export const HOST_COMMAND_RESULT_NOTIFY_CHANNEL = "host_command_result";
