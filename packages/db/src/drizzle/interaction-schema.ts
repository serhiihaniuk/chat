import type { JsonObject } from "@side-chat/shared";
import {
  check,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  type PgSchema,
} from "drizzle-orm/pg-core";

import {
  CLIENT_TOOL_DISPATCH_STATES,
  HOST_COMMAND_RESULT_STATUSES,
  TOOL_INVOCATION_STATUSES,
  type ClientToolDispatchState,
  type HostCommandResultStatus,
  type ToolInvocationStatus,
} from "#schema-contract";
import type {
  assistantTurns,
  createdAt,
  inList,
  workspaceIdColumn,
} from "./schema.js";

type InteractionSchemaDependencies = {
  readonly sidechat: PgSchema;
  readonly assistantTurns: typeof assistantTurns;
  readonly workspaceIdColumn: typeof workspaceIdColumn;
  readonly createdAt: typeof createdAt;
  readonly inList: typeof inList;
};

/** Tables that persist model-tool and legacy browser-interaction records. */
export const defineInteractionTables = ({
  sidechat,
  assistantTurns,
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
      uniqueIndex("client_tool_dispatches_turn_call_uq").on(
        table.assistantTurnId,
        table.toolCallId,
      ),
      check(
        "client_tool_dispatches_state_check",
        inList("state", CLIENT_TOOL_DISPATCH_STATES),
      ),
    ],
  );

  const hostCommandResults = sidechat.table(
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
      status: text("status").$type<HostCommandResultStatus>().notNull(),
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

  return { toolInvocations, clientToolDispatches, hostCommandResults };
};
