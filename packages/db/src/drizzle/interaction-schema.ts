import type { JsonObject } from "@side-chat/shared";
import {
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  type PgSchema,
} from "drizzle-orm/pg-core";

import {
  CLIENT_TOOL_DISPATCH_STATES,
  TOOL_INVOCATION_STATUSES,
  TOOL_APPROVAL_STATES,
  type ClientToolDispatchState,
  type ToolInvocationStatus,
  type ToolApprovalState,
} from "#schema-contract";
import { SIDECHAT_UNIQUE_INDEXES } from "./constraint-names.js";
import type {
  assistantTurns,
  conversations,
  createdAt,
  inList,
  workspaceIdColumn,
} from "./schema.js";

type InteractionSchemaDependencies = {
  readonly sidechat: PgSchema;
  readonly assistantTurns: typeof assistantTurns;
  readonly conversations: typeof conversations;
  readonly workspaceIdColumn: typeof workspaceIdColumn;
  readonly createdAt: typeof createdAt;
  readonly inList: typeof inList;
};

/** Model-tool records, client-tool coordination, approvals, and maintenance links. */
export const defineInteractionTables = ({
  sidechat,
  assistantTurns,
  conversations,
  workspaceIdColumn,
  createdAt,
  inList,
}: InteractionSchemaDependencies) => {
  const toolInvocations = sidechat.table(
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
      status: text("status").$type<ToolInvocationStatus>().notNull(),
      inputHash: text("input_hash").notNull(),
      outputHash: text("output_hash"),
      inputRedactedJson: jsonb("input_redacted_json").$type<JsonObject>().notNull(),
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
      uniqueIndex(SIDECHAT_UNIQUE_INDEXES.TOOL_INVOCATIONS_TURN_CALL).on(
        table.assistantTurnId,
        table.toolCallId,
      ),
      check("tool_invocations_status_check", inList("status", TOOL_INVOCATION_STATUSES)),
    ],
  );

  const clientToolDispatches = sidechat.table(
    "client_tool_dispatches",
    {
      clientToolDispatchId: text("client_tool_dispatch_id").primaryKey(),
      assistantTurnId: text("assistant_turn_id")
        .notNull()
        .references(() => assistantTurns.assistantTurnId),
      workspaceId: workspaceIdColumn(),
      toolCallId: text("tool_call_id").notNull(),
      toolName: text("tool_name").notNull(),
      clientToolCapabilityDigest: text("client_tool_capability_digest").notNull(),
      state: text("state").$type<ClientToolDispatchState>().notNull(),
      // The object envelope distinguishes `{ value: null }` from no model outcome.
      outputJson: jsonb("output_json").$type<JsonObject>(),
      dispatchedAt: timestamp("dispatched_at", {
        mode: "string",
        withTimezone: true,
      }).notNull(),
      completedAt: timestamp("completed_at", {
        mode: "string",
        withTimezone: true,
      }),
      lateResultAt: timestamp("late_result_at", {
        mode: "string",
        withTimezone: true,
      }),
    },
    (table) => [
      uniqueIndex(SIDECHAT_UNIQUE_INDEXES.CLIENT_TOOL_DISPATCHES_TURN_CALL).on(
        table.assistantTurnId,
        table.toolCallId,
      ),
      check("client_tool_dispatches_state_check", inList("state", CLIENT_TOOL_DISPATCH_STATES)),
    ],
  );

  const toolApprovals = defineToolApprovals({
    sidechat,
    assistantTurns,
    workspaceIdColumn,
    inList,
  });

  const conversationTitleRuns = sidechat.table(
    "conversation_title_runs",
    {
      // The durable title-generation Workflow run id. Title runs are their own
      // Workflow runs with no assistant_turns row, so one row here links each to
      // its conversation, letting journal maintenance honor legal_hold for title
      // runs the same way it does for turn-bound runs.
      runId: text("run_id").primaryKey(),
      workspaceId: workspaceIdColumn(),
      conversationId: text("conversation_id")
        .notNull()
        .references(() => conversations.conversationId),
      createdAt: createdAt(),
    },
    (table) => [
      index("conversation_title_runs_conversation_idx").on(table.workspaceId, table.conversationId),
    ],
  );

  return {
    toolInvocations,
    clientToolDispatches,
    toolApprovals,
    conversationTitleRuns,
  };
};

function defineToolApprovals({
  sidechat,
  assistantTurns,
  workspaceIdColumn,
  inList,
}: Pick<
  InteractionSchemaDependencies,
  "sidechat" | "assistantTurns" | "workspaceIdColumn" | "inList"
>) {
  return sidechat.table(
    "tool_approvals",
    {
      approvalId: text("approval_id").primaryKey(),
      assistantTurnId: text("assistant_turn_id")
        .notNull()
        .references(() => assistantTurns.assistantTurnId),
      workspaceId: workspaceIdColumn(),
      toolCallId: text("tool_call_id").notNull(),
      toolName: text("tool_name").notNull(),
      inputDigest: text("input_digest").notNull(),
      state: text("state").$type<ToolApprovalState>().notNull().default("requested"),
      decidedBySubjectId: text("decided_by_subject_id"),
      decidedByActorId: text("decided_by_actor_id"),
      requestedAt: timestamp("requested_at", {
        mode: "string",
        withTimezone: true,
      }).notNull(),
      decidedAt: timestamp("decided_at", {
        mode: "string",
        withTimezone: true,
      }),
      expiresAt: timestamp("expires_at", {
        mode: "string",
        withTimezone: true,
      }).notNull(),
    },
    (table) => [
      uniqueIndex(SIDECHAT_UNIQUE_INDEXES.TOOL_APPROVALS_TURN_CALL).on(
        table.assistantTurnId,
        table.toolCallId,
      ),
      check("tool_approvals_state_check", inList("state", TOOL_APPROVAL_STATES)),
    ],
  );
}
