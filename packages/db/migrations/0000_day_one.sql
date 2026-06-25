CREATE TABLE "sidechat"."assistant_turns" (
	"assistant_turn_id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"user_message_id" text NOT NULL,
	"assistant_message_id" text,
	"runtime_profile" text NOT NULL,
	"system_prompt_version" text NOT NULL,
	"context_strategy_version" text NOT NULL,
	"tool_registry_version" text NOT NULL,
	"model_provider" text NOT NULL,
	"model_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"finish_reason" text,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"owner_instance_id" text,
	"lease_expires_at" timestamp with time zone,
	"lease_epoch" integer DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	CONSTRAINT "assistant_turns_status_check" CHECK (status in ('running', 'completed', 'user_aborted', 'timed_out', 'provider_failed', 'tool_failed', 'persistence_failed'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."audit_events" (
	"audit_event_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sidechat"."conversations" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"conversation_key" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title_text" text,
	"created_by_actor_id" text NOT NULL,
	"history_cutoff_sequence_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK (status in ('active', 'archived', 'reset'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."host_command_results" (
	"host_command_id" text PRIMARY KEY NOT NULL,
	"assistant_turn_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"command_id" text NOT NULL,
	"command_type" text NOT NULL,
	"resource_id" text,
	"status" text NOT NULL,
	"result_code" text NOT NULL,
	"command_redacted_json" jsonb NOT NULL,
	"result_redacted_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "host_command_results_status_check" CHECK (status in ('emitted', 'applied', 'rejected', 'unsupported', 'failed', 'timed_out'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."messages" (
	"message_id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"role" text NOT NULL,
	"content_text" text NOT NULL,
	"metadata_json" jsonb NOT NULL,
	"sequence_index" integer NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_check" CHECK (role in ('user', 'assistant', 'system', 'tool'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."tool_invocations" (
	"tool_invocation_id" text PRIMARY KEY NOT NULL,
	"assistant_turn_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"runtime_step_index" integer NOT NULL,
	"tool_call_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"status" text NOT NULL,
	"input_hash" text NOT NULL,
	"output_hash" text,
	"input_redacted_json" jsonb NOT NULL,
	"output_redacted_json" jsonb,
	"error_code" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tool_invocations_status_check" CHECK (status in ('running', 'completed', 'failed', 'cancelled', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."turn_context_snapshots" (
	"context_snapshot_id" text PRIMARY KEY NOT NULL,
	"assistant_turn_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"context_schema_version" text NOT NULL,
	"host_surface_id" text,
	"host_context_hash" text NOT NULL,
	"capabilities_hash" text NOT NULL,
	"context_redacted_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sidechat"."turn_events" (
	"assistant_turn_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"type" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turn_events_assistant_turn_id_sequence_pk" PRIMARY KEY("assistant_turn_id","sequence"),
	CONSTRAINT "turn_events_type_check" CHECK (type in ('started', 'delta', 'activity', 'completed', 'error', 'blocked', 'history'))
);
--> statement-breakpoint
CREATE TABLE "sidechat"."usage_records" (
	"usage_record_id" text PRIMARY KEY NOT NULL,
	"assistant_turn_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"runtime_step_index" integer NOT NULL,
	"model_provider" text NOT NULL,
	"model_id" text NOT NULL,
	"provider_request_id" text,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"reasoning_tokens" integer DEFAULT 0 NOT NULL,
	"cached_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer NOT NULL,
	"cost_units" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sidechat"."assistant_turns" ADD CONSTRAINT "assistant_turns_conversation_id_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "sidechat"."conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."assistant_turns" ADD CONSTRAINT "assistant_turns_user_message_id_messages_message_id_fk" FOREIGN KEY ("user_message_id") REFERENCES "sidechat"."messages"("message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."assistant_turns" ADD CONSTRAINT "assistant_turns_assistant_message_id_messages_message_id_fk" FOREIGN KEY ("assistant_message_id") REFERENCES "sidechat"."messages"("message_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."host_command_results" ADD CONSTRAINT "host_command_results_assistant_turn_id_assistant_turns_assistant_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "sidechat"."assistant_turns"("assistant_turn_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."messages" ADD CONSTRAINT "messages_conversation_id_conversations_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "sidechat"."conversations"("conversation_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."tool_invocations" ADD CONSTRAINT "tool_invocations_assistant_turn_id_assistant_turns_assistant_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "sidechat"."assistant_turns"("assistant_turn_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."turn_context_snapshots" ADD CONSTRAINT "turn_context_snapshots_assistant_turn_id_assistant_turns_assistant_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "sidechat"."assistant_turns"("assistant_turn_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."turn_events" ADD CONSTRAINT "turn_events_assistant_turn_id_assistant_turns_assistant_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "sidechat"."assistant_turns"("assistant_turn_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sidechat"."usage_records" ADD CONSTRAINT "usage_records_assistant_turn_id_assistant_turns_assistant_turn_id_fk" FOREIGN KEY ("assistant_turn_id") REFERENCES "sidechat"."assistant_turns"("assistant_turn_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_turns_workspace_request_uq" ON "sidechat"."assistant_turns" USING btree ("workspace_id","request_id");--> statement-breakpoint
CREATE INDEX "assistant_turns_conversation_started_idx" ON "sidechat"."assistant_turns" USING btree ("conversation_id","started_at");--> statement-breakpoint
CREATE INDEX "audit_events_workspace_created_idx" ON "sidechat"."audit_events" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_target_created_idx" ON "sidechat"."audit_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_workspace_subject_key_uq" ON "sidechat"."conversations" USING btree ("workspace_id","subject_id","conversation_key");--> statement-breakpoint
CREATE UNIQUE INDEX "host_command_results_turn_command_uq" ON "sidechat"."host_command_results" USING btree ("assistant_turn_id","command_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_conversation_sequence_uq" ON "sidechat"."messages" USING btree ("conversation_id","sequence_index");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_workspace_idempotency_uq" ON "sidechat"."messages" USING btree ("workspace_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "messages_conversation_sequence_desc_idx" ON "sidechat"."messages" USING btree ("conversation_id","sequence_index");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_invocations_turn_call_uq" ON "sidechat"."tool_invocations" USING btree ("assistant_turn_id","tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_context_snapshots_turn_uq" ON "sidechat"."turn_context_snapshots" USING btree ("assistant_turn_id");--> statement-breakpoint
CREATE INDEX "turn_context_snapshots_workspace_hash_idx" ON "sidechat"."turn_context_snapshots" USING btree ("workspace_id","host_context_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_events_one_terminal" ON "sidechat"."turn_events" USING btree ("assistant_turn_id") WHERE type in ('completed', 'error', 'blocked');--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_turn_step_uq" ON "sidechat"."usage_records" USING btree ("assistant_turn_id","runtime_step_index");