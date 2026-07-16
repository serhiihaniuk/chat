import type { JsonObject } from "@side-chat/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
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
  MESSAGE_ROLES,
  type AssistantTurnStatus,
  type ConversationStatus,
  type MessageRole,
} from "#schema-contract";
import { SIDECHAT_UNIQUE_INDEXES } from "./constraint-names.js";
import { defineInteractionTables } from "./interaction-schema.js";

const sidechat = pgSchema("sidechat");

export const createdAt = () =>
  timestamp("created_at", { mode: "string", withTimezone: true }).notNull().defaultNow();

const updatedAt = () =>
  timestamp("updated_at", { mode: "string", withTimezone: true }).notNull().defaultNow();

export const workspaceIdColumn = () => text("workspace_id").notNull();

export const inList = (columnName: string, values: readonly string[]) =>
  sql.raw(`${columnName} in (${values.map((value) => `'${value}'`).join(", ")})`);

export const conversations = sidechat.table(
  "conversations",
  {
    conversationId: text("conversation_id").primaryKey(),
    workspaceId: workspaceIdColumn(),
    subjectId: text("subject_id").notNull(),
    conversationKey: text("conversation_key").notNull(),
    status: text("status").$type<ConversationStatus>().notNull().default("active"),
    titleText: text("title_text"),
    createdByActorId: text("created_by_actor_id").notNull(),
    historyCutoffSequenceIndex: integer("history_cutoff_sequence_index"),
    // Regulated-deployment requirement: any prune/delete path must skip a held
    // conversation. Cheap to carry now, always demanded later (KNOWLEDGE §Regulated).
    legalHold: boolean("legal_hold").notNull().default(false),
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
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.CONVERSATIONS_WORKSPACE_SUBJECT_KEY).on(
      table.workspaceId,
      table.subjectId,
      table.conversationKey,
    ),
    // The sidebar lists a subject's unbounded conversations newest-first on every
    // panel open; this serves the (workspace, subject) filter + `last_message_at DESC`
    // order as a top-N index scan instead of sorting the whole set. (The unique index
    // above filters on the same columns but cannot order by last_message_at.)
    index("conversations_workspace_subject_recent_idx").on(
      table.workspaceId,
      table.subjectId,
      table.lastMessageAt,
    ),
    check("conversations_status_check", inList("status", CONVERSATION_STATUSES)),
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
    role: text("role").$type<MessageRole>().notNull(),
    // The AI SDK `UIMessage.parts` verbatim — the one durable message shape,
    // identical to the wire and the widget. jsonb is the truth; `role` is a query
    // aid. Tool inputs/outputs live inside these parts (regulated full record).
    parts: jsonb("parts").$type<readonly JsonObject[]>().notNull(),
    metadataJson: jsonb("metadata_json").$type<JsonObject>().notNull(),
    sequenceIndex: integer("sequence_index").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    // History reads (`sequence_index DESC`) and the append `max(sequence_index)` are
    // both served by the unique index below scanned backwards (no second index needed).
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.MESSAGES_CONVERSATION_SEQUENCE).on(
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
    assistantMessageId: text("assistant_message_id").references(() => messages.messageId),
    // The durable Workflow run this turn attaches to (reconnect/replay handle).
    // Null between the turn row insert and the run start, then bound once.
    runId: text("run_id"),
    runBoundAt: timestamp("run_bound_at", {
      mode: "string",
      withTimezone: true,
    }),
    cancelRequestedAt: timestamp("cancel_requested_at", {
      mode: "string",
      withTimezone: true,
    }),
    // Provenance for a regulated deployment: exactly which model, prompt, config,
    // and content-filter version produced this turn (KNOWLEDGE §Regulated).
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    instructionsVersion: text("instructions_version").notNull(),
    configVersion: text("config_version").notNull(),
    contentFilterVersion: text("content_filter_version").notNull(),
    status: text("status").$type<AssistantTurnStatus>().notNull().default("open"),
    finishReason: text("finish_reason"),
    errorCode: text("error_code"),
    // Aggregate usage across all steps, folded onto the turn (v7 token detail).
    // Zero until the turn reaches a terminal status.
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
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
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_WORKSPACE_REQUEST).on(
      table.workspaceId,
      table.requestId,
    ),
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_RUN)
      .on(table.runId)
      .where(sql`run_id is not null`),
    index("assistant_turns_conversation_started_idx").on(table.conversationId, table.startedAt),
    // One running turn per conversation, enforced by the database. This is the
    // race-safe busy guard: a concurrent second turn hits a unique violation
    // instead of a check-then-act window. Partial, so it covers only the tiny
    // in-flight working set and terminal turns never collide.
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_ONE_OPEN_PER_CONVERSATION)
      .on(table.conversationId)
      .where(sql`status = 'open'`),
    check(
      "assistant_turns_run_binding_check",
      sql`(run_id is null and run_bound_at is null) or (run_id is not null and run_bound_at is not null)`,
    ),
    check("assistant_turns_status_check", inList("status", ASSISTANT_TURN_STATUSES)),
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
    contextRedactedJson: jsonb("context_redacted_json").$type<JsonObject>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.TURN_CONTEXT_SNAPSHOTS_TURN).on(table.assistantTurnId),
    index("turn_context_snapshots_workspace_hash_idx").on(table.workspaceId, table.hostContextHash),
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
    uniqueIndex(SIDECHAT_UNIQUE_INDEXES.USAGE_RECORDS_TURN_STEP).on(
      table.assistantTurnId,
      table.runtimeStepIndex,
    ),
    // `readUsageSummary` sums by workspace; without this the aggregate full-scans a
    // table that grows one row per runtime step forever. This bounds the scan to a
    // workspace's rows — a rollup table is the next step past ~10^7 rows (see
    // capacity-and-deployment.md).
    index("usage_records_workspace_idx").on(table.workspaceId),
  ],
);

export const {
  toolInvocations,
  clientToolDispatches,
  toolApprovals,
  conversationTitleRuns,
} = defineInteractionTables({
  sidechat,
  assistantTurns,
  conversations,
  workspaceIdColumn,
  createdAt,
  inList,
});

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
    index("audit_events_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("audit_events_target_created_idx").on(table.targetType, table.targetId, table.createdAt),
  ],
);

export const sidechatTables = {
  conversations,
  messages,
  assistantTurns,
  turnContextSnapshots,
  conversationTitleRuns,
  usageRecords,
  toolInvocations,
  clientToolDispatches,
  toolApprovals,
  auditEvents,
} as const;
