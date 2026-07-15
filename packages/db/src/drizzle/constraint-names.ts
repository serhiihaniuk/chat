/**
 * Canonical names for the schema's unique indexes.
 *
 * Defined once here and referenced by both the drizzle table definitions and the
 * repository code that classifies a unique violation by name, so a constraint name
 * never lives as a bare string in two places that must agree.
 */
export const SIDECHAT_UNIQUE_INDEXES = {
  CONVERSATIONS_WORKSPACE_SUBJECT_KEY: "conversations_workspace_subject_key_uq",
  MESSAGES_CONVERSATION_SEQUENCE: "messages_conversation_sequence_uq",
  ASSISTANT_TURNS_WORKSPACE_REQUEST: "assistant_turns_workspace_request_uq",
  ASSISTANT_TURNS_RUN: "assistant_turns_run_uq",
  ASSISTANT_TURNS_ONE_OPEN_PER_CONVERSATION: "assistant_turns_one_open_per_conversation_uq",
  TURN_CONTEXT_SNAPSHOTS_TURN: "turn_context_snapshots_turn_uq",
  USAGE_RECORDS_TURN_STEP: "usage_records_turn_step_uq",
  TOOL_INVOCATIONS_TURN_CALL: "tool_invocations_turn_call_uq",
  CLIENT_TOOL_DISPATCHES_TURN_CALL: "client_tool_dispatches_turn_call_uq",
  TOOL_APPROVALS_TURN_CALL: "tool_approvals_turn_call_uq",
  HOST_COMMAND_RESULTS_TURN_COMMAND: "host_command_results_turn_command_uq",
} as const;
