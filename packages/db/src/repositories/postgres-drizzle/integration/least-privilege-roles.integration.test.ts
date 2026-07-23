import { describe, expect, it } from "vitest";

import {
  createWorkflowPool,
  seedWorkflowRun,
} from "#testing/turn/turn-recovery.integration.test-support";

const databaseUrl = requireDatabaseUrl();

describe("PostgreSQL least-privilege roles", () => {
  it("keeps the runtime Workflow grant read-only and column-scoped", async () => {
    const pool = createWorkflowPool(databaseUrl);
    const runId = `run_runtime_grant_${crypto.randomUUID()}`;
    const client = await pool.connect();
    try {
      await seedWorkflowRun(client, runId, "pending");
      await client.query("set role sidechat_runtime");
      await expect(
        client.query("select id, status from workflow.workflow_runs limit 1"),
      ).resolves.toBeDefined();
      await expect(
        client.query("select input from workflow.workflow_runs limit 1"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        client.query("update workflow.workflow_runs set status = status where id = $1", [runId]),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
      await pool.end();
    }
  });

  it("enforces the runtime and maintenance Side Chat roles in PostgreSQL", async () => {
    const pool = createWorkflowPool(databaseUrl);
    const client = await pool.connect();
    try {
      await client.query("set role sidechat_runtime");
      await expect(client.query("select 1 from sidechat.messages limit 1")).resolves.toBeDefined();
      await expect(
        client.query("create table sidechat.runtime_privilege_escape (id text)"),
      ).rejects.toMatchObject({ code: "42501" });

      await client.query("reset role");
      await client.query("set role sidechat_maintenance");
      await expect(
        client.query("select 1 from sidechat.assistant_turns limit 1"),
      ).resolves.toBeDefined();
      await expect(
        client.query("select 1 from sidechat.conversations limit 1"),
      ).resolves.toBeDefined();
      await expect(
        client.query("select 1 from sidechat.conversation_title_runs limit 1"),
      ).resolves.toBeDefined();
      await expect(client.query("select 1 from sidechat.messages limit 1")).rejects.toMatchObject({
        code: "42501",
      });
      await expect(
        client.query("update sidechat.conversations set legal_hold = legal_hold where false"),
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      client.release();
      await pool.end();
    }
  });
});

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for database integration tests.");
  }
  return value;
}
