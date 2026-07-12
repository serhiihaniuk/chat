/// <reference types="node" />

import { readFileSync } from "node:fs";
import { isRecord, parseJsonRecord } from "@side-chat/shared";
import { describe, expect, it } from "vitest";

import { SIDECHAT_UNIQUE_INDEXES } from "./constraint-names.js";
import { sidechatTables } from "./schema.js";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const journal = readMigrationJournal(
  readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8"),
);
const migration = journal.entries
  .slice()
  .sort((left, right) => left.idx - right.idx)
  .map((entry) => readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"))
  .join("\n")
  .replaceAll("\r\n", "\n");
const grants = readFileSync(
  new URL("../../sql/runtime-role-grants.sql", import.meta.url),
  "utf8",
).replaceAll("\r\n", "\n");

describe("sidechat drizzle schema and migration", () => {
  it("exports the day-one logical tables", () => {
    expect(Object.keys(sidechatTables)).toEqual([
      "conversations",
      "messages",
      "assistantTurns",
      "turnContextSnapshots",
      "conversationTitleRuns",
      "usageRecords",
      "toolInvocations",
      "clientToolDispatches",
      "hostCommandResults",
      "auditEvents",
    ]);
  });

  it("generates table DDL without PostgreSQL enum lifecycle types", () => {
    expect(migration).not.toMatch(/CREATE TYPE .* AS ENUM/u);
    expect(migration).toContain('"sidechat"."host_command_results"');
    expect(migration).toContain('"sidechat"."client_tool_dispatches"');
    expect(migration).toContain('"sidechat"."conversation_title_runs"');
    // The dead nullable idempotency column and its index are gone (message_id PK).
    expect(migration).not.toContain("idempotency_key");
    expect(migration).toContain("status in ('active', 'archived', 'reset')");
  });

  it("carries the v7 assistant-turn provenance, folded usage, and run binding", () => {
    // The durable Workflow run handle, bound once after the run starts.
    expect(migration).toContain('"run_id" text');
    // Regulated provenance: exactly which prompt, config, and filter produced it.
    expect(migration).toContain('"instructions_version" text NOT NULL');
    expect(migration).toContain('"config_version" text NOT NULL');
    expect(migration).toContain('"content_filter_version" text NOT NULL');
    // Aggregate usage folded onto the turn, zero until a terminal status.
    expect(migration).toContain('"input_tokens" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('"cached_input_tokens" integer DEFAULT 0 NOT NULL');
    // Every failure collapses to one `failed` status; the reaper's per-cause
    // statuses are gone.
    expect(migration).toContain(
      "status in ('running', 'completed', 'failed', 'cancelled', 'blocked')",
    );
    // The lease/cancel recovery columns went with the reaper.
    expect(migration).not.toContain("owner_instance_id");
    expect(migration).not.toContain("lease_epoch");
    expect(migration).not.toContain("cancel_requested_at");
    // The durable message body is the AI SDK `parts` array — no `content_text`.
    expect(migration).toContain('"parts" jsonb NOT NULL');
    expect(migration).not.toContain("content_text");
    // A prune/delete path must be able to skip a held conversation.
    expect(migration).toContain('"legal_hold" boolean DEFAULT false NOT NULL');
  });

  it("indexes the hot query working sets and drops the redundant message index", () => {
    // Partial unique index over only running turns: it is both the race-safe
    // one-running-per-conversation busy guard and the in-flight lookup the resume
    // and activity reads scan — never the full history.
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "${SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_ONE_RUNNING_PER_CONVERSATION}" ON "sidechat"."assistant_turns" USING btree ("conversation_id") WHERE status = 'running';`,
    );
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "${SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_RUN}" ON "sidechat"."assistant_turns" USING btree ("run_id") WHERE run_id is not null;`,
    );
    expect(migration).toContain(
      `CREATE UNIQUE INDEX "${SIDECHAT_UNIQUE_INDEXES.CLIENT_TOOL_DISPATCHES_TURN_CALL}" ON "sidechat"."client_tool_dispatches" USING btree ("assistant_turn_id","tool_call_id")`,
    );
    // Workspace-scoped usage summary must not full-scan an ever-growing table.
    expect(migration).toContain(
      'CREATE INDEX "usage_records_workspace_idx" ON "sidechat"."usage_records" USING btree ("workspace_id")',
    );
    // The sidebar list orders a subject's growing conversation set newest-first.
    expect(migration).toContain(
      'CREATE INDEX "conversations_workspace_subject_recent_idx" ON "sidechat"."conversations" USING btree ("workspace_id","subject_id","last_message_at")',
    );
    // The unique index serves history/`max()` reads scanned backwards, so the
    // same-columns plain index is gone, avoiding duplicate write work per insert.
    expect(migration).toContain(`"${SIDECHAT_UNIQUE_INDEXES.MESSAGES_CONVERSATION_SEQUENCE}"`);
    expect(migration).not.toContain("messages_conversation_sequence_desc_idx");
  });

  it("keeps runtime least privilege in the durable role grants", () => {
    expect(grants).toContain("CREATE ROLE sidechat_runtime NOLOGIN");
    expect(grants).toContain("GRANT USAGE ON SCHEMA sidechat TO sidechat_runtime");
    expect(grants).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE\n {2}ON ALL TABLES IN SCHEMA sidechat\n {2}TO sidechat_runtime/u,
    );
    // Runtime must never receive CREATE on the schema.
    expect(grants).not.toMatch(/GRANT[^;]*\bCREATE\b[^;]*TO sidechat_runtime/u);
  });
});

type MigrationJournal = {
  readonly entries: readonly MigrationJournalEntry[];
};

type MigrationJournalEntry = {
  readonly idx: number;
  readonly tag: string;
};

function readMigrationJournal(source: string): MigrationJournal {
  const parsed = parseJsonRecord(source);
  if (!parsed || !Array.isArray(parsed["entries"])) {
    throw new Error("Drizzle migration journal must contain an entries array.");
  }

  return { entries: parsed["entries"].map(readMigrationJournalEntry) };
}

function readMigrationJournalEntry(value: unknown): MigrationJournalEntry {
  if (!isRecord(value) || typeof value["idx"] !== "number" || typeof value["tag"] !== "string") {
    throw new Error(
      "Each Drizzle migration journal entry must contain numeric idx and string tag.",
    );
  }
  return { idx: value["idx"], tag: value["tag"] };
}
