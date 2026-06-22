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
 * Durable classifier for one persisted turn-event row.
 *
 * The row payload is the browser-facing stream event; this column is the
 * protocol-free type the persistence boundary checks and indexes on. The values
 * mirror the stream event kinds without the `sidechat.` transport prefix so the
 * `db` package never imports protocol DTOs (see package-boundaries.md).
 */
export const TURN_EVENT_TYPES = [
  "started",
  "delta",
  "activity",
  "completed",
  "error",
  "blocked",
  "history",
] as const;
export type TurnEventType = (typeof TURN_EVENT_TYPES)[number];

/**
 * The turn-event types that close a turn.
 *
 * Exactly one terminal row may exist per turn; the partial unique index
 * `turn_events_one_terminal` enforces that across the normal stream, abnormal
 * finalize, and reaper append paths.
 */
export const TURN_EVENT_TERMINAL_TYPES = ["completed", "error", "blocked"] as const;
export type TurnEventTerminalType = (typeof TURN_EVENT_TERMINAL_TYPES)[number];

const TURN_EVENT_TERMINAL_TYPE_SET = new Set<string>(TURN_EVENT_TERMINAL_TYPES);

export const isTurnEventTerminalType = (type: string): type is TurnEventTerminalType =>
  TURN_EVENT_TERMINAL_TYPE_SET.has(type);

/**
 * Postgres `LISTEN/NOTIFY` channel the event-log append signals on.
 *
 * Single-sourced with the table so the per-instance listener (added in a later
 * step) subscribes to the exact channel `appendTurnEvent` notifies. The
 * `notifyChannel` config tunable defaults to this value.
 */
export const TURN_EVENTS_NOTIFY_CHANNEL = "turn_events";

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
 * in a subject's sidebar — even chats the user is not viewing. Unlike
 * `TURN_EVENTS_NOTIFY_CHANNEL` (keyed only by `assistantTurnId`), the payload
 * carries the full scope `{ workspaceId, subjectId, conversationId, assistantTurnId,
 * status }` so the dispatcher fans out by subject without a per-signal read.
 */
export const TURN_ACTIVITY_NOTIFY_CHANNEL = "turn_activity";
