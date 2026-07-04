/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { sidechatTables } from "./schema.js";

const migrationsDir = new URL("../../migrations/", import.meta.url);
const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", migrationsDir), "utf8"));
const migration = journal.entries
  .slice()
  .sort((left: { idx: number }, right: { idx: number }) => left.idx - right.idx)
  .map((entry: { tag: string }) => readFileSync(new URL(`${entry.tag}.sql`, migrationsDir), "utf8"))
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
      "usageRecords",
      "toolInvocations",
      "hostCommandResults",
      "auditEvents",
    ]);
  });

  it("generates table DDL without PostgreSQL enum lifecycle types", () => {
    expect(migration).not.toMatch(/CREATE TYPE .* AS ENUM/u);
    expect(migration).toContain('"sidechat"."host_command_results"');
    expect(migration).toContain("status in ('active', 'archived', 'reset')");
  });

  it("adds resumable-streaming lease and cancel columns to assistant turns", () => {
    expect(migration).toContain('"owner_instance_id" text');
    expect(migration).toContain('"lease_expires_at" timestamp with time zone');
    expect(migration).toContain('"lease_epoch" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('"cancel_requested_at" timestamp with time zone');
  });

  it("indexes the hot query working sets and drops the redundant message index", () => {
    // Partial index over only running turns: the activity snapshot, the per-create
    // concurrency guard, the resume lookup, and the reaper/cancel-rescan all read
    // the in-flight set, never the full history.
    expect(migration).toMatch(
      /CREATE INDEX "assistant_turns_running_lookup_idx" ON "sidechat"\."assistant_turns" USING btree \("workspace_id","subject_id","conversation_id"\) WHERE status = 'running';/u,
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
    // same-columns plain index is gone — no per-insert write overhead.
    expect(migration).toContain('"messages_conversation_sequence_uq"');
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
