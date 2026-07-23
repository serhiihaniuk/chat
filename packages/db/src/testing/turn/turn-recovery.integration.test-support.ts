import { Pool } from "pg";

import { createPostgresDrizzleSidechatRepositories } from "#repositories/postgres-drizzle/index";

export const STARTED_AT = "2026-05-23T13:00:00.000Z";
export const CANCEL_REQUESTED_AT = "2026-05-23T13:00:01.000Z";
export const SECOND_CANCEL_AT = "2026-05-23T13:00:02.000Z";
export const WITHIN_RECOVERY_GRACE = "2026-05-23T13:00:30.000Z";
export const RECOVERY_GRACE_EXPIRED = "2026-05-23T13:01:00.000Z";
export const AFTER_RECOVERY = "2026-05-23T13:01:01.000Z";
export const RECOVERY_GRACE_MS = 60_000;
export const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
} as const;

export const createRecoveryRepositories = (connectionString: string) =>
  createPostgresDrizzleSidechatRepositories({ connectionString });

export const createWorkflowPool = (connectionString: string) => new Pool({ connectionString });

export const seedWorkflowRun = (
  pool: Pick<Pool, "query">,
  runId: string,
  status: "pending" | "running" | "completed" | "failed" | "cancelled",
) =>
  pool.query(
    `insert into workflow.workflow_runs
     (id, deployment_id, status, name, attributes, created_at, updated_at)
   values ($1, 'test-deployment', $2, 'chat-turn', '{}'::jsonb, $3, $3)`,
    [runId, status, STARTED_AT],
  );

export const setWorkflowRunStatus = (
  pool: Pick<Pool, "query">,
  runId: string,
  status: "completed" | "failed" | "cancelled",
) =>
  pool.query("update workflow.workflow_runs set status = $2, completed_at = $3 where id = $1", [
    runId,
    status,
    CANCEL_REQUESTED_AT,
  ]);
