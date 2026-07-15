import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { createPostgresDrizzleSidechatRepositories } from "../index.js";
import { startTurn, workspaceId } from "#testing/repository-contract.helpers";

const databaseUrl = requireDatabaseUrl();
const NOW = "2026-05-23T13:00:00.000Z";
let scopeIndex = 0;

describe("postgres Workflow turn recovery", () => {
  it("derives activity from Workflow and repairs a terminal mismatch", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const pool = new Pool({ connectionString: databaseUrl });
    const scope = nextScope();
    const runId = `run_effective_activity_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await seedWorkflowRun(pool, runId, "pending");
      await repositories.claimTurnRun({
        workspaceId: workspaceId(scope),
        subjectId: turn.subjectId,
        conversationId: turn.conversationId,
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: NOW,
      });

      await expect(
        repositories.findActiveAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
        }),
      ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, runId });

      await pool.query(
        "update workflow.workflow_runs set status = 'completed', completed_at = $2 where id = $1",
        [runId, NOW],
      );
      await expect(
        repositories.findActiveAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
        }),
      ).resolves.toBeUndefined();
      await expect(
        repositories.resolveConversationTurnAvailability({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          recoveryGraceMs: 60_000,
          now: NOW,
        }),
      ).resolves.toBe(true);
      await expect(
        repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          assistantTurnId: turn.assistantTurnId,
        }),
      ).resolves.toMatchObject({ status: "failed", errorCode: "workflow_failed" });
    } finally {
      await pool.end();
      await repositories.close();
    }
  });

  it("waits through missing-run grace, then fences a late Workflow claim", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const runId = `run_missing_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await repositories.bindTurnRun({
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: NOW,
      });
      await expect(
        repositories.resolveConversationTurnAvailability({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          recoveryGraceMs: 60_000,
          now: "2026-05-23T13:00:30.000Z",
        }),
      ).resolves.toBe(false);
      await expect(
        repositories.resolveConversationTurnAvailability({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          recoveryGraceMs: 60_000,
          now: "2026-05-23T13:01:00.000Z",
        }),
      ).resolves.toBe(true);
      await expect(
        repositories.claimTurnRun({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: "2026-05-23T13:01:01.000Z",
        }),
      ).resolves.toMatchObject({ claimed: false, record: { status: "failed" } });
    } finally {
      await repositories.close();
    }
  });

  it("persists cancellation intent and resolves a missing Workflow run", async () => {
    const repositories = createPostgresDrizzleSidechatRepositories({
      connectionString: databaseUrl,
    });
    const scope = nextScope();
    const runId = `run_cancel_missing_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await repositories.bindTurnRun({
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: NOW,
      });
      await expect(
        repositories.requestTurnCancellation({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          runId,
          now: "2026-05-23T13:00:01.000Z",
        }),
      ).resolves.toBe("acknowledged");
      await expect(
        repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          assistantTurnId: turn.assistantTurnId,
        }),
      ).resolves.toMatchObject({
        status: "cancelled",
        cancelRequestedAt: "2026-05-23T13:00:01.000Z",
      });
    } finally {
      await repositories.close();
    }
  });

  it("keeps the runtime Workflow grant read-only and column-scoped", async () => {
    const pool = new Pool({ connectionString: databaseUrl });
    const runId = `run_runtime_grant_${nextScope()}`;
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
});

const nextScope = (): string => {
  scopeIndex += 1;
  return `turn_recovery_${scopeIndex}`;
};

const seedWorkflowRun = (
  pool: Pick<Pool, "query">,
  runId: string,
  status: "pending" | "running" | "completed" | "failed" | "cancelled",
) =>
  pool.query(
    `insert into workflow.workflow_runs
     (id, deployment_id, status, name, attributes, created_at, updated_at)
   values ($1, 'test-deployment', $2, 'chat-turn', '{}'::jsonb, $3, $3)`,
    [runId, status, NOW],
  );

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value)
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for database integration tests.");
  return value;
}
