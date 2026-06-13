/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { sidechatTables } from "./schema.js";

const migration = readFileSync(
  new URL("../../migrations/0000_side_chat_day_one.sql", import.meta.url),
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

  it("creates the dedicated schema without PostgreSQL enum lifecycle types", () => {
    expect(migration).toContain("CREATE SCHEMA IF NOT EXISTS sidechat");
    expect(migration).not.toMatch(/CREATE TYPE .* AS ENUM/u);
    expect(migration).toContain("CHECK (status IN ('active', 'archived', 'reset'))");
    expect(migration).toContain("sidechat.host_command_results");
  });

  it("defines runtime least privilege without schema DDL grants", () => {
    expect(migration).toContain("CREATE ROLE sidechat_runtime NOLOGIN");
    expect(migration).toContain("GRANT USAGE ON SCHEMA sidechat TO sidechat_runtime");
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE\n  ON ALL TABLES IN SCHEMA sidechat\n  TO sidechat_runtime",
    );
    expect(migration).not.toMatch(
      /GRANT\s+(?:USAGE,\s*)?CREATE\s+ON\s+SCHEMA\s+sidechat\s+TO\s+sidechat_runtime/iu,
    );
  });
});
