import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createPostgresDrizzleSidechatRepositories } from "./postgres-drizzle.js";

const databaseUrl = requireDatabaseUrl();
const now = "2026-05-23T13:00:00.000Z";

describe("postgres drizzle repositories", () => {
  it("applies migrations and proves the repository contract against Postgres", async () => {
    await applyMigrations(databaseUrl);
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });

    try {
      const conversation = await repositories.createOrGetConversation({
        workspaceId: "workspace_pg_1",
        subjectId: "subject_pg_1",
        actorId: "actor_pg_1",
        conversationKey: "default",
        now,
      });
      const repeated = await repositories.createOrGetConversation({
        workspaceId: "workspace_pg_1",
        subjectId: "subject_pg_1",
        actorId: "actor_pg_1",
        conversationKey: "default",
        now,
      });

      expect(repeated.inserted).toBe(false);
      expect(repeated.record.conversationId).toBe(
        conversation.record.conversationId,
      );

      const message = await repositories.appendMessage({
        workspaceId: "workspace_pg_1",
        subjectId: "subject_pg_1",
        conversationId: conversation.record.conversationId,
        role: "user",
        contentText: "hello from postgres",
        metadataJson: {},
        idempotencyKey: { value: "request_pg_1:user" },
        now,
      });
      const history = await repositories.readConversationHistory({
        workspaceId: "workspace_pg_1",
        subjectId: "subject_pg_1",
        conversationId: conversation.record.conversationId,
        limit: 10,
      });

      expect(message.inserted).toBe(true);
      expect(history.at(-1)?.contentText).toBe("hello from postgres");
    } finally {
      await repositories.close();
    }
  });
});

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error(
      "SIDECHAT_TEST_DATABASE_URL is required for test:db:integration.",
    );
  }
  return value;
}

const applyMigrations = async (connectionString: string): Promise<void> => {
  const pool = new Pool({ connectionString });
  const migrationPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../migrations/0000_side_chat_day_one.sql",
  );

  try {
    await pool.query("DROP SCHEMA IF EXISTS sidechat CASCADE");
    await pool.query(await readFile(migrationPath, "utf8"));
  } finally {
    await pool.end();
  }
};
