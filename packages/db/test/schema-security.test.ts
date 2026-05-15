import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("schema initialization enforces runtime grants", () => {
  const schemaSqlPath = path.resolve(
    process.cwd(),
    "docker/postgres/init/001_schema.sql",
  );
  const schemaSql = fs.readFileSync(schemaSqlPath, "utf8");

  it("grants sidechat_app execute on required procedures/functions", () => {
    expect(schemaSql).toContain(
      "grant execute on function sidechat_create_or_get_conversation(text, text, text) to sidechat_app;",
    );
    expect(schemaSql).toContain(
      "grant execute on function sidechat_append_user_message(text, text, text) to sidechat_app;",
    );
    expect(schemaSql).toContain(
      "grant execute on function sidechat_append_assistant_message(text, text, text, text, text) to sidechat_app;",
    );
    expect(schemaSql).toContain(
      "grant execute on function sidechat_read_seeded_history(text, text) to sidechat_app;",
    );
    expect(schemaSql).toContain(
      "grant execute on function sidechat_record_usage(text, text, text, text, text, int, int, int) to sidechat_app;",
    );
    expect(schemaSql).toContain(
      "grant execute on function sidechat_get_workspace_context(text, text) to sidechat_app;",
    );
  });

  it("revokes direct table access from runtime role", () => {
    expect(schemaSql).toContain(
      "revoke all on all tables in schema sidechat from sidechat_app;",
    );
  });

  it("defines the required stored procedures/functions", () => {
    expect(schemaSql).toContain(
      "create or replace function sidechat_create_or_get_conversation",
    );
    expect(schemaSql).toContain(
      "create or replace function sidechat_append_user_message",
    );
    expect(schemaSql).toContain(
      "create or replace function sidechat_append_assistant_message",
    );
    expect(schemaSql).toContain(
      "create or replace function sidechat_read_seeded_history",
    );
    expect(schemaSql).toContain(
      "create or replace function sidechat_record_usage",
    );
  });
});
