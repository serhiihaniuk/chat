import type { JsonObject } from "@side-chat/chat-protocol";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  ASSISTANT_TURN_STATUSES,
  CONVERSATION_STATUSES,
  HOST_COMMAND_RESULT_STATUSES,
  MESSAGE_ROLES,
  TOOL_INVOCATION_STATUSES,
} from "../schema-contract/index.js";

const sidechat = pgSchema("sidechat");

const createdAt = () =>
  timestamp("created_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { mode: "string", withTimezone: true })
    .notNull()
    .defaultNow();

const workspaceIdColumn = () => text("workspace_id").notNull();

const inList = (columnName: string, values: readonly string[]) =>
  sql.raw(
    `${columnName} in (${values.map((value) => `'${value}'`).join(", ")})`,
  );

export const conversations = sidechat.table(
  "conversations",
  {
    conversationId: text("conversation_id").primaryKey(),
    workspaceId: workspaceIdColumn(),
    subjectId: text("subject_id").notNull(),
    conversationKey: text("conversation_key").notNull(),
    status: text("status").notNull().default("active"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    lastMessageAt: timestamp("last_message_at", {
      mode: "string",
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversations_workspace_subject_key_uq").on(
      table.workspaceId,
      table.subjectId,
      table.conversationKey,
    ),
    check(
      "conversations_status_check",
      inList("status", CONVERSATION_STATUSES),
    ),
  ],
);

export const messages = sidechat.table(
  "messages",
  {
    messageId: text("message_id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.conversationId),
    workspaceId: workspaceIdColumn(),
    role: text("role").notNull(),
    contentText: text("content_text").notNull(),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
    sequenceIndex: integer("sequence_index").notNull(),
    idempotencyKey: text("idempotency_key"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("messages_conversation_sequence_uq").on(
      table.conversationId,
      table.sequenceIndex,
    ),
    uniqueIndex("messages_workspace_idempotency_uq").on(
      table.workspaceId,
      table.idempotencyKey,
    ),
    index("messages_conversation_sequence_desc_idx").on(
      table.conversationId,
      table.sequenceIndex,
    ),
    check("messages_role_check", inList("role", MESSAGE_ROLES)),
  ],
);

export const assistantTurns = sidechat.table(
  "assistant_turns",
  {
    assistantTurnId: text("assistant_turn_id").primaryKey(),
    requestId: text("request_id").notNull(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.conversationId),
    workspaceId: workspaceIdColumn(),
    subjectId: text("subject_id").notNull(),
    actorId: text("actor_id").notNull(),
    userMessageId: text("user_message_id")
      .notNull()
      .references(() => messages.messageId),
    assistantMessageId: text("assistant_message_id").references(
      () => messages.messageId,
    ),
    runtimeProfile: text("runtime_profile").notNull(),
    systemPromptVersion: text("system_prompt_version").notNull(),
    contextStrategyVersion: text("context_strategy_version").notNull(),
    toolRegistryVersion: text("tool_registry_version").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    status: text("status").notNull().default("running"),
    finishReason: text("finish_reason"),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "string",
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("assistant_turns_workspace_request_uq").on(
      table.workspaceId,
      table.requestId,
    ),
    index("assistant_turns_conversation_started_idx").on(
      table.conversationId,
      table.startedAt,
    ),
    check(
      "assistant_turns_status_check",
      inList("status", ASSISTANT_TURN_STATUSES),
    ),
  ],
);

export const turnContextSnapshots = sidechat.table(
  "turn_context_snapshots",
  {
    contextSnapshotId: text("context_snapshot_id").primaryKey(),
    assistantTurnId: text("assistant_turn_id")
      .notNull()
      .references(() => assistantTurns.assistantTurnId),
    workspaceId: workspaceIdColumn(),
    contextSchemaVersion: text("context_schema_version").notNull(),
    hostSurfaceId: text("host_surface_id"),
    hostContextHash: text("host_context_hash").notNull(),
    capabilitiesHash: text("capabilities_hash").notNull(),
    contextRedactedJson: jsonb("context_redacted_json")
      .$type<JsonObject>()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("turn_context_snapshots_turn_uq").on(table.assistantTurnId),
    index("turn_context_snapshots_workspace_hash_idx").on(
      table.workspaceId,
      table.hostContextHash,
    ),
  ],
);

export const usageRecords = sidechat.table(
  "usage_records",
  {
    usageRecordId: text("usage_record_id").primaryKey(),
    assistantTurnId: text("assistant_turn_id")
      .notNull()
      .references(() => assistantTurns.assistantTurnId),
    workspaceId: workspaceIdColumn(),
    runtimeStepIndex: integer("runtime_step_index").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    providerRequestId: text("provider_request_id"),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull(),
    costUnits: text("cost_units").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("usage_records_turn_step_uq").on(
      table.assistantTurnId,
      table.runtimeStepIndex,
    ),
  ],
);

export const toolInvocations = sidechat.table(
  "tool_invocations",
  {
    toolInvocationId: text("tool_invocation_id").primaryKey(),
    assistantTurnId: text("assistant_turn_id")
      .notNull()
      .references(() => assistantTurns.assistantTurnId),
    workspaceId: workspaceIdColumn(),
    runtimeStepIndex: integer("runtime_step_index").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    toolName: text("tool_name").notNull(),
    status: text("status").notNull(),
    inputHash: text("input_hash").notNull(),
    outputHash: text("output_hash"),
    inputRedactedJson: jsonb("input_redacted_json")
      .$type<JsonObject>()
      .notNull(),
    outputRedactedJson: jsonb("output_redacted_json").$type<JsonObject>(),
    errorCode: text("error_code"),
    startedAt: timestamp("started_at", {
      mode: "string",
      withTimezone: true,
    }).notNull(),
    completedAt: timestamp("completed_at", {
      mode: "string",
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("tool_invocations_turn_call_uq").on(
      table.assistantTurnId,
      table.toolCallId,
    ),
    check(
      "tool_invocations_status_check",
      inList("status", TOOL_INVOCATION_STATUSES),
    ),
  ],
);

export const hostCommandResults = sidechat.table(
  "host_command_results",
  {
    hostCommandId: text("host_command_id").primaryKey(),
    assistantTurnId: text("assistant_turn_id")
      .notNull()
      .references(() => assistantTurns.assistantTurnId),
    workspaceId: workspaceIdColumn(),
    commandId: text("command_id").notNull(),
    commandType: text("command_type").notNull(),
    resourceId: text("resource_id"),
    status: text("status").notNull(),
    resultCode: text("result_code").notNull(),
    commandRedactedJson: jsonb("command_redacted_json")
      .$type<JsonObject>()
      .notNull(),
    resultRedactedJson: jsonb("result_redacted_json").$type<JsonObject>(),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", {
      mode: "string",
      withTimezone: true,
    }),
  },
  (table) => [
    uniqueIndex("host_command_results_turn_command_uq").on(
      table.assistantTurnId,
      table.commandId,
    ),
    check(
      "host_command_results_status_check",
      inList("status", HOST_COMMAND_RESULT_STATUSES),
    ),
  ],
);

export const auditEvents = sidechat.table(
  "audit_events",
  {
    auditEventId: text("audit_event_id").primaryKey(),
    workspaceId: workspaceIdColumn(),
    subjectId: text("subject_id").notNull(),
    actorId: text("actor_id").notNull(),
    eventType: text("event_type").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
    requestId: text("request_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_events_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
  ],
);

export const sidechatTables = {
  conversations,
  messages,
  assistantTurns,
  turnContextSnapshots,
  usageRecords,
  toolInvocations,
  hostCommandResults,
  auditEvents,
} as const;
