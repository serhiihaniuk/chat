CREATE SCHEMA IF NOT EXISTS sidechat;

CREATE TABLE sidechat.conversations (
  conversation_id text PRIMARY KEY,
  workspace_id text NOT NULL,
  subject_id text NOT NULL,
  conversation_key text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'reset')),
  title_text text,
  created_by_actor_id text NOT NULL,
  history_cutoff_sequence_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_workspace_subject_key_uq
    UNIQUE (workspace_id, subject_id, conversation_key)
);

CREATE TABLE sidechat.messages (
  message_id text PRIMARY KEY,
  conversation_id text NOT NULL
    REFERENCES sidechat.conversations (conversation_id),
  workspace_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content_text text NOT NULL,
  metadata_json jsonb NOT NULL,
  sequence_index integer NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_conversation_sequence_uq
    UNIQUE (conversation_id, sequence_index),
  CONSTRAINT messages_workspace_idempotency_uq
    UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE sidechat.assistant_turns (
  assistant_turn_id text PRIMARY KEY,
  request_id text NOT NULL,
  conversation_id text NOT NULL
    REFERENCES sidechat.conversations (conversation_id),
  workspace_id text NOT NULL,
  subject_id text NOT NULL,
  actor_id text NOT NULL,
  user_message_id text NOT NULL REFERENCES sidechat.messages (message_id),
  assistant_message_id text REFERENCES sidechat.messages (message_id),
  runtime_profile text NOT NULL,
  system_prompt_version text NOT NULL,
  context_strategy_version text NOT NULL,
  tool_registry_version text NOT NULL,
  model_provider text NOT NULL,
  model_id text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (
      status IN (
        'running',
        'completed',
        'user_aborted',
        'timed_out',
        'provider_failed',
        'tool_failed',
        'persistence_failed'
      )
    ),
  finish_reason text,
  error_code text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT assistant_turns_workspace_request_uq
    UNIQUE (workspace_id, request_id)
);

CREATE TABLE sidechat.turn_context_snapshots (
  context_snapshot_id text PRIMARY KEY,
  assistant_turn_id text NOT NULL
    REFERENCES sidechat.assistant_turns (assistant_turn_id),
  workspace_id text NOT NULL,
  context_schema_version text NOT NULL,
  host_surface_id text,
  host_context_hash text NOT NULL,
  capabilities_hash text NOT NULL,
  context_redacted_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT turn_context_snapshots_turn_uq UNIQUE (assistant_turn_id)
);

CREATE TABLE sidechat.usage_records (
  usage_record_id text PRIMARY KEY,
  assistant_turn_id text NOT NULL
    REFERENCES sidechat.assistant_turns (assistant_turn_id),
  workspace_id text NOT NULL,
  runtime_step_index integer NOT NULL,
  model_provider text NOT NULL,
  model_id text NOT NULL,
  provider_request_id text,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  cached_input_tokens integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  total_tokens integer NOT NULL CHECK (total_tokens >= 0),
  cost_units text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_records_turn_step_uq
    UNIQUE (assistant_turn_id, runtime_step_index)
);

CREATE TABLE sidechat.tool_invocations (
  tool_invocation_id text PRIMARY KEY,
  assistant_turn_id text NOT NULL
    REFERENCES sidechat.assistant_turns (assistant_turn_id),
  workspace_id text NOT NULL,
  runtime_step_index integer NOT NULL,
  tool_call_id text NOT NULL,
  tool_name text NOT NULL,
  status text NOT NULL
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'skipped')),
  input_hash text NOT NULL,
  output_hash text,
  input_redacted_json jsonb NOT NULL,
  output_redacted_json jsonb,
  error_code text,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  CONSTRAINT tool_invocations_turn_call_uq
    UNIQUE (assistant_turn_id, tool_call_id)
);

CREATE TABLE sidechat.host_command_results (
  host_command_id text PRIMARY KEY,
  assistant_turn_id text NOT NULL
    REFERENCES sidechat.assistant_turns (assistant_turn_id),
  workspace_id text NOT NULL,
  command_id text NOT NULL,
  command_type text NOT NULL,
  resource_id text,
  status text NOT NULL
    CHECK (
      status IN (
        'emitted',
        'applied',
        'rejected',
        'unsupported',
        'failed',
        'timed_out'
      )
    ),
  result_code text NOT NULL,
  command_redacted_json jsonb NOT NULL,
  result_redacted_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT host_command_results_turn_command_uq
    UNIQUE (assistant_turn_id, command_id)
);

CREATE TABLE sidechat.audit_events (
  audit_event_id text PRIMARY KEY,
  workspace_id text NOT NULL,
  subject_id text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  metadata_json jsonb NOT NULL,
  request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX messages_conversation_sequence_desc_idx
  ON sidechat.messages (conversation_id, sequence_index DESC);
CREATE INDEX assistant_turns_conversation_started_idx
  ON sidechat.assistant_turns (conversation_id, started_at DESC);
CREATE INDEX turn_context_snapshots_workspace_hash_idx
  ON sidechat.turn_context_snapshots (workspace_id, host_context_hash);
CREATE INDEX audit_events_workspace_created_idx
  ON sidechat.audit_events (workspace_id, created_at DESC);
CREATE INDEX audit_events_target_created_idx
  ON sidechat.audit_events (target_type, target_id, created_at DESC);

DO $$
BEGIN
  CREATE ROLE sidechat_owner NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE sidechat_migrator NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE sidechat_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA sidechat TO sidechat_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA sidechat
  TO sidechat_runtime;
GRANT USAGE, CREATE ON SCHEMA sidechat TO sidechat_migrator;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA sidechat TO sidechat_migrator;
