import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createPostgresWorkflowJournalMaintenance,
  type WorkflowJournalSnapshot,
} from "./workflow-journal-maintenance.js";

const configuredDatabaseUrl = process.env["SIDECHAT_TEST_DATABASE_URL"];
const databaseUrl = configuredDatabaseUrl ?? "postgres://skipped.invalid/sidechat";
const OLD_COMPLETION = new Date("2026-01-01T00:00:00.000Z");
const CUTOFF = new Date("2026-02-01T00:00:00.000Z");

describe.skipIf(!configuredDatabaseUrl)("Postgres Workflow journal maintenance", () => {
  const inspectionPool = new Pool({ connectionString: databaseUrl });

  beforeEach(async () => {
    await inspectionPool.query(
      `truncate workflow.workflow_events, workflow.workflow_hooks,
                workflow.workflow_steps, workflow.workflow_waits,
                workflow.workflow_stream_chunks, workflow.workflow_runs`,
    );
  });

  afterAll(async () => {
    await inspectionPool.end();
  });

  it("archives all six tables and prunes only old, terminal, non-held bound runs", async () => {
    const eligible = await seedRun(inspectionPool, "eligible", {});
    const held = await seedRun(inspectionPool, "held", { legalHold: true });
    const activeTurn = await seedRun(inspectionPool, "active-turn", {
      turnStatus: "open",
    });
    const activeWorkflow = await seedRun(inspectionPool, "active-workflow", {
      workflowStatus: "running",
      completedAt: undefined,
    });
    const young = await seedRun(inspectionPool, "young", {
      completedAt: new Date("2026-03-01T00:00:00.000Z"),
    });
    const snapshots: WorkflowJournalSnapshot[] = [];
    const expectedPrunedBytes = await measureJournalBytes(inspectionPool, eligible);
    const maintenance = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
      archive: (snapshot) => {
        snapshots.push(snapshot);
        return Promise.resolve();
      },
    });

    try {
      await expect(maintenance.validateSchema()).resolves.toBeUndefined();
      const result = await maintenance.sweep({
        completedBefore: CUTOFF,
        batchLimit: 20,
      });

      expect(result).toMatchObject({
        lockAcquired: true,
        selectedRuns: 1,
        archivedRuns: 1,
        prunedRuns: 1,
        prunedBytes: expectedPrunedBytes,
      });
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toMatchObject({ runId: eligible });
      expect(snapshots[0]?.runs).toHaveLength(1);
      expect(snapshots[0]?.events).toHaveLength(1);
      expect(snapshots[0]?.steps).toHaveLength(1);
      expect(snapshots[0]?.hooks).toHaveLength(1);
      expect(snapshots[0]?.waits).toHaveLength(1);
      expect(snapshots[0]?.streamChunks).toHaveLength(1);
      await expect(readWorkflowRunIds(inspectionPool)).resolves.toEqual(
        [held, activeTurn, activeWorkflow, young].sort(),
      );
    } finally {
      await maintenance.close();
    }
  });

  it("prunes an old title-generation run and skips a legally held one", async () => {
    // Title runs are their own Workflow runs with no assistant_turns row. Before
    // the linkage table the prune's join skipped them entirely, so they leaked.
    await seedTitleRun(inspectionPool, "title-eligible", {});
    const heldTitle = await seedTitleRun(inspectionPool, "title-held", {
      legalHold: true,
    });
    const maintenance = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
    });

    try {
      const result = await maintenance.sweep({
        completedBefore: CUTOFF,
        batchLimit: 20,
      });
      expect(result).toMatchObject({
        lockAcquired: true,
        selectedRuns: 1,
        prunedRuns: 1,
      });
      // The eligible title run's journal is pruned; the held one survives.
      await expect(readWorkflowRunIds(inspectionPool)).resolves.toEqual([heldTitle]);
    } finally {
      await maintenance.close();
    }
  });

  it("rolls back every delete when archival fails", async () => {
    const runId = await seedRun(inspectionPool, "archive-failure", {});
    const maintenance = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
      archive: () => Promise.reject(new Error("archive unavailable")),
    });

    try {
      await expect(maintenance.sweep({ completedBefore: CUTOFF, batchLimit: 10 })).rejects.toThrow(
        "archive unavailable",
      );
      await expect(readWorkflowRunIds(inspectionPool)).resolves.toContain(runId);
      await expect(countRunRows(inspectionPool, runId)).resolves.toEqual([1, 1, 1, 1, 1, 1]);
    } finally {
      await maintenance.close();
    }
  });

  it("uses the advisory lock for concurrent sweeps and becomes a no-op after pruning", async () => {
    await seedRun(inspectionPool, "concurrent", {});
    const archiveStarted = Promise.withResolvers<void>();
    const releaseArchive = Promise.withResolvers<void>();
    const first = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
      archive: async () => {
        archiveStarted.resolve();
        await releaseArchive.promise;
      },
    });
    const second = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
    });

    try {
      const firstSweep = first.sweep({
        completedBefore: CUTOFF,
        batchLimit: 10,
      });
      await archiveStarted.promise;
      await expect(
        second.sweep({ completedBefore: CUTOFF, batchLimit: 10 }),
      ).resolves.toMatchObject({
        lockAcquired: false,
        selectedRuns: 0,
        prunedRuns: 0,
      });
      releaseArchive.resolve();
      await expect(firstSweep).resolves.toMatchObject({
        lockAcquired: true,
        prunedRuns: 1,
      });
      await expect(
        second.sweep({ completedBefore: CUTOFF, batchLimit: 10 }),
      ).resolves.toMatchObject({
        lockAcquired: true,
        selectedRuns: 0,
        prunedRuns: 0,
      });
    } finally {
      releaseArchive.resolve();
      await first.close();
      await second.close();
    }
  });

  it("honors the distinct-run batch limit", async () => {
    await seedRun(inspectionPool, "batch-a", {});
    await seedRun(inspectionPool, "batch-b", {});
    const maintenance = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
    });
    try {
      await expect(
        maintenance.sweep({ completedBefore: CUTOFF, batchLimit: 1 }),
      ).resolves.toMatchObject({ selectedRuns: 1, prunedRuns: 1 });
      await expect(readWorkflowRunIds(inspectionPool)).resolves.toHaveLength(1);
    } finally {
      await maintenance.close();
    }
  });

  it("reports only age metadata for the oldest effective non-terminal run", async () => {
    const now = new Date("2026-01-03T00:00:00.000Z");
    await seedRun(inspectionPool, "old-pending", {
      workflowStatus: "pending",
      completedAt: undefined,
      workflowStartedAt: null,
    });
    await seedRun(inspectionPool, "young-running", {
      workflowStatus: "running",
      completedAt: undefined,
      workflowStartedAt: new Date("2026-01-02T00:00:00.000Z"),
    });
    await seedRun(inspectionPool, "older-completed", {
      workflowStartedAt: new Date("2025-12-01T00:00:00.000Z"),
    });
    const maintenance = createPostgresWorkflowJournalMaintenance({
      connectionString: databaseUrl,
    });

    try {
      await expect(maintenance.oldestNonterminalRun(now)).resolves.toEqual({
        startedAt: OLD_COMPLETION,
        ageMs: 2 * 24 * 60 * 60 * 1_000,
      });
    } finally {
      await maintenance.close();
    }
  });
});

type SeedOptions = Readonly<{
  legalHold?: boolean;
  turnStatus?: "open" | "completed";
  workflowStatus?: "pending" | "running" | "completed";
  completedAt?: Date | undefined;
  workflowStartedAt?: Date | null;
}>;

async function seedRun(pool: Pool, label: string, options: SeedOptions): Promise<string> {
  const scope = `${label}-${crypto.randomUUID()}`;
  const workspaceId = `workspace-${scope}`;
  const conversationId = `conversation-${scope}`;
  const messageId = `message-${scope}`;
  const turnId = `turn-${scope}`;
  const runId = `run-${scope}`;
  const turnStatus = options.turnStatus ?? "completed";
  const workflowStatus = options.workflowStatus ?? "completed";
  const completedAt = options.completedAt === undefined ? OLD_COMPLETION : options.completedAt;

  await pool.query(
    `insert into sidechat.conversations
       (conversation_id, workspace_id, subject_id, conversation_key,
        created_by_actor_id, legal_hold, last_message_at)
     values ($1, $2, $3, $4, $3, $5, $6)`,
    [
      conversationId,
      workspaceId,
      `subject-${scope}`,
      scope,
      options.legalHold ?? false,
      OLD_COMPLETION,
    ],
  );
  await pool.query(
    `insert into sidechat.messages
       (message_id, conversation_id, workspace_id, role, parts, metadata_json, sequence_index)
     values ($1, $2, $3, 'user', '[]'::jsonb, '{}'::jsonb, 0)`,
    [messageId, conversationId, workspaceId],
  );
  await pool.query(
    `insert into sidechat.assistant_turns
       (assistant_turn_id, request_id, conversation_id, workspace_id, subject_id,
        actor_id, user_message_id, run_id, run_bound_at, model_provider, model_id,
        instructions_version, config_version, content_filter_version, status,
        started_at, completed_at)
     values ($1, $2, $3, $4, $5, $5, $6, $7, $9, 'test', 'test',
             'v1', 'v1', 'v1', $8, $9, $10)`,
    [
      turnId,
      `request-${scope}`,
      conversationId,
      workspaceId,
      `subject-${scope}`,
      messageId,
      runId,
      turnStatus,
      OLD_COMPLETION,
      turnStatus === "open" ? undefined : OLD_COMPLETION,
    ],
  );
  await seedWorkflowRows(
    pool,
    runId,
    workflowStatus,
    completedAt,
    options.workflowStartedAt === undefined ? OLD_COMPLETION : options.workflowStartedAt,
  );
  return runId;
}

async function seedTitleRun(
  pool: Pool,
  label: string,
  options: Readonly<{ legalHold?: boolean }>,
): Promise<string> {
  const scope = `${label}-${crypto.randomUUID()}`;
  const workspaceId = `workspace-${scope}`;
  const conversationId = `conversation-${scope}`;
  const runId = `run-${scope}`;

  await pool.query(
    `insert into sidechat.conversations
       (conversation_id, workspace_id, subject_id, conversation_key,
        created_by_actor_id, legal_hold, last_message_at)
     values ($1, $2, $3, $4, $3, $5, $6)`,
    [
      conversationId,
      workspaceId,
      `subject-${scope}`,
      scope,
      options.legalHold ?? false,
      OLD_COMPLETION,
    ],
  );
  await pool.query(
    `insert into sidechat.conversation_title_runs
       (run_id, workspace_id, conversation_id, created_at)
     values ($1, $2, $3, $4)`,
    [runId, workspaceId, conversationId, OLD_COMPLETION],
  );
  await seedWorkflowRows(pool, runId, "completed", OLD_COMPLETION, OLD_COMPLETION);
  return runId;
}

async function seedWorkflowRows(
  pool: Pool,
  runId: string,
  status: "pending" | "running" | "completed",
  completedAt: Date | undefined,
  startedAt: Date | null,
): Promise<void> {
  await pool.query(
    `insert into workflow.workflow_runs
       (id, deployment_id, status, name, attributes, created_at, updated_at,
        started_at, completed_at)
     values ($1, 'deployment', $2, 'chat-turn', '{}'::jsonb, $3, $3, $4, $5)`,
    [runId, status, OLD_COMPLETION, startedAt, completedAt],
  );
  await pool.query(
    `insert into workflow.workflow_events (id, type, created_at, run_id)
     values ($1, 'run_completed', $2, $3)`,
    [`event-${runId}`, OLD_COMPLETION, runId],
  );
  await pool.query(
    `insert into workflow.workflow_steps
       (run_id, step_id, step_name, status, attempt, created_at, updated_at)
     values ($1, $2, 'model', 'completed', 1, $3, $3)`,
    [runId, `step-${runId}`, OLD_COMPLETION],
  );
  await pool.query(
    `insert into workflow.workflow_hooks
       (run_id, hook_id, token, owner_id, project_id, environment,
        created_at, is_webhook, is_system)
     values ($1, $2, $3, 'owner', 'project', 'test', $4, false, false)`,
    [runId, `hook-${runId}`, `token-${runId}`, OLD_COMPLETION],
  );
  await pool.query(
    `insert into workflow.workflow_waits
       (wait_id, run_id, status, created_at, updated_at)
     values ($1, $2, 'completed', $3, $3)`,
    [`wait-${runId}`, runId, OLD_COMPLETION],
  );
  await pool.query(
    `insert into workflow.workflow_stream_chunks
       (id, stream_id, run_id, data, created_at, eof)
     values ($1, $2, $3, $4, $5, true)`,
    [`chunk-${runId}`, `stream-${runId}`, runId, Buffer.from("chunk"), OLD_COMPLETION],
  );
}

async function readWorkflowRunIds(pool: Pool): Promise<readonly string[]> {
  const result = await pool.query<{ id: string }>(
    "select id from workflow.workflow_runs order by id",
  );
  return result.rows.map((row) => row.id);
}

async function countRunRows(pool: Pool, runId: string): Promise<readonly number[]> {
  const result = await pool.query<{ counts: number[] }>(
    `select array[
       (select count(*)::int from workflow.workflow_runs where id = $1),
       (select count(*)::int from workflow.workflow_events where run_id = $1),
       (select count(*)::int from workflow.workflow_steps where run_id = $1),
       (select count(*)::int from workflow.workflow_hooks where run_id = $1),
       (select count(*)::int from workflow.workflow_waits where run_id = $1),
       (select count(*)::int from workflow.workflow_stream_chunks where run_id = $1)
     ] as counts`,
    [runId],
  );
  return result.rows[0]?.counts ?? [];
}

async function measureJournalBytes(pool: Pool, runId: string): Promise<number> {
  const result = await pool.query<{ bytes: string }>(
    `select (
       (select pg_column_size(workflow_run.*) from workflow.workflow_runs workflow_run where id = $1) +
       (select sum(pg_column_size(workflow_event.*)) from workflow.workflow_events workflow_event where run_id = $1) +
       (select sum(pg_column_size(workflow_step.*)) from workflow.workflow_steps workflow_step where run_id = $1) +
       (select sum(pg_column_size(workflow_hook.*)) from workflow.workflow_hooks workflow_hook where run_id = $1) +
       (select sum(pg_column_size(workflow_wait.*)) from workflow.workflow_waits workflow_wait where run_id = $1) +
       (select sum(pg_column_size(stream_chunk.*)) from workflow.workflow_stream_chunks stream_chunk where run_id = $1)
     )::text as bytes`,
    [runId],
  );
  return Number(result.rows[0]?.bytes ?? 0);
}
