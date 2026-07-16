import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";

import { PINNED_WORKFLOW_TABLE_NAMES } from "./workflow-journal-schema.js";
import {
  readWorkflowJournalSnapshot,
  type WorkflowJournalSnapshot,
} from "./workflow-journal-archive.js";
import {
  readOldestNonterminalRun,
  validatePinnedSchema,
} from "./inspection/workflow-journal-inspection.js";

export type { WorkflowJournalRow, WorkflowJournalSnapshot } from "./workflow-journal-archive.js";

export {
  assertPinnedWorkflowJournalSchema,
  WorkflowJournalSchemaError,
  type WorkflowJournalSchemaShape,
} from "./workflow-journal-schema.js";

const TERMINAL_TURN_STATUSES = ["completed", "failed", "cancelled", "blocked"] as const;
const TERMINAL_WORKFLOW_STATUSES = ["completed", "failed", "cancelled"] as const;

/**
 * Archives one run before hot-journal deletion.
 *
 * The callback may be called again after a later retry if a transaction rolls
 * back after archival. Implementations must therefore use `runId` as an
 * idempotency key and either replace or accept an already archived snapshot.
 */
export type ArchiveWorkflowJournal = (snapshot: WorkflowJournalSnapshot) => Promise<void>;

export type WorkflowJournalSweepOptions = Readonly<{
  completedBefore: Date;
  batchLimit: number;
}>;

export type WorkflowJournalSweepResult = Readonly<{
  lockAcquired: boolean;
  selectedRuns: number;
  archivedRuns: number;
  prunedRuns: number;
  /** Sum of `pg_column_size` for the journal rows deleted by this sweep. */
  prunedBytes: number;
  deletedRows: Readonly<{
    events: number;
    steps: number;
    hooks: number;
    waits: number;
    streamChunks: number;
    runs: number;
  }>;
}>;

/** Content-free process-wide age metadata for the oldest active Workflow run. */
export type OldestNonterminalWorkflowRun = Readonly<{
  startedAt: Date;
  ageMs: number;
}>;

export type WorkflowJournalMaintenance = Readonly<{
  validateSchema: () => Promise<void>;
  sweep: (options: WorkflowJournalSweepOptions) => Promise<WorkflowJournalSweepResult>;
  oldestNonterminalRun: (now: Date) => Promise<OldestNonterminalWorkflowRun | undefined>;
  close: () => Promise<void>;
}>;

/** Build the Postgres World maintenance adapter over its dedicated connection pool. */
export function createPostgresWorkflowJournalMaintenance(options: {
  readonly connectionString: string;
  readonly pool?: PoolConfig | undefined;
  readonly archive?: ArchiveWorkflowJournal | undefined;
}): WorkflowJournalMaintenance {
  const pool = new Pool({
    ...options.pool,
    connectionString: options.connectionString,
  });
  const validateSchema = () => validatePinnedSchema(pool);
  return {
    validateSchema,
    sweep: (sweepOptions) => runSweep(pool, sweepOptions, options.archive),
    oldestNonterminalRun: (now) => readOldestNonterminalRun(pool, now),
    close: () => pool.end(),
  };
}

type LockRow = QueryResultRow & Readonly<{ acquired: boolean }>;
type RunIdRow = QueryResultRow & Readonly<{ run_id: string }>;
type ByteCountRow = QueryResultRow & Readonly<{ bytes: string }>;

async function runSweep(
  pool: Pool,
  options: WorkflowJournalSweepOptions,
  archive: ArchiveWorkflowJournal | undefined,
): Promise<WorkflowJournalSweepResult> {
  validateSweepOptions(options);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await validatePinnedSchema(client);
    const lockAcquired = await acquireSweepLock(client);
    if (!lockAcquired) {
      await client.query("rollback");
      return emptyResult(false);
    }

    const runIds = await selectEligibleRunIds(client, options);
    const archivedRuns = await archiveRuns(client, runIds, archive);
    const prunedBytes = await measureJournalRows(client, runIds);
    const deletedRows = await deleteRuns(client, runIds);
    await client.query("commit");
    return {
      lockAcquired: true,
      selectedRuns: runIds.length,
      archivedRuns,
      prunedRuns: deletedRows.runs,
      prunedBytes,
      deletedRows,
    };
  } catch (error) {
    return await rollbackAfterFailure(client, error);
  } finally {
    client.release();
  }
}

async function acquireSweepLock(client: PoolClient): Promise<boolean> {
  const result = await client.query<LockRow>(
    "select pg_try_advisory_xact_lock($1, $2) as acquired",
    [1_396_914_772, 1_903_853_422],
  );
  return result.rows[0]?.acquired === true;
}

async function selectEligibleRunIds(
  client: PoolClient,
  options: WorkflowJournalSweepOptions,
): Promise<readonly string[]> {
  // Prune a run only when its owning conversation is off legal hold. The joins
  // resolve that conversation for a turn-bound run and a title run alike, so both
  // are held the same way; a run that matches neither is left alone.
  //
  // The sweep deletes only `workflow.*`, so it row-locks just workflow_run and
  // reads sidechat with plain SELECT — the maintenance grant needs no UPDATE,
  // which could otherwise alter legal_hold.
  const result = await client.query<RunIdRow>(
    `select workflow_run.id as run_id
       from workflow.workflow_runs workflow_run
       left join sidechat.assistant_turns assistant_turn
         on assistant_turn.run_id = workflow_run.id
       left join sidechat.conversation_title_runs title_run
         on title_run.run_id = workflow_run.id
       join sidechat.conversations conversation
         on conversation.workspace_id
              = coalesce(assistant_turn.workspace_id, title_run.workspace_id)
        and conversation.conversation_id
              = coalesce(assistant_turn.conversation_id, title_run.conversation_id)
      where workflow_run.status = any($1::workflow.status[])
        and workflow_run.completed_at < $3
        and conversation.legal_hold = false
        and (assistant_turn.run_id is not null or title_run.run_id is not null)
        and (assistant_turn.run_id is null or assistant_turn.status = any($2::text[]))
      order by workflow_run.completed_at, workflow_run.id
      limit $4
      for update of workflow_run skip locked`,
    [
      TERMINAL_WORKFLOW_STATUSES,
      TERMINAL_TURN_STATUSES,
      options.completedBefore,
      options.batchLimit,
    ],
  );
  return uniqueRunIds(result.rows);
}

async function archiveRuns(
  client: PoolClient,
  runIds: readonly string[],
  archive: ArchiveWorkflowJournal | undefined,
): Promise<number> {
  if (!archive) return 0;
  for (const runId of runIds) {
    await archive(await readWorkflowJournalSnapshot(client, runId));
  }
  return runIds.length;
}

async function measureJournalRows(client: PoolClient, runIds: readonly string[]): Promise<number> {
  if (runIds.length === 0) return 0;
  const result = await client.query<ByteCountRow>(
    `select coalesce(sum(journal_row.byte_count), 0)::text as bytes
       from (
         select pg_column_size(workflow_run.*)::bigint as byte_count
           from workflow.workflow_runs workflow_run
          where workflow_run.id = any($1::text[])
         union all
         select pg_column_size(workflow_event.*)::bigint
           from workflow.workflow_events workflow_event
          where workflow_event.run_id = any($1::text[])
         union all
         select pg_column_size(workflow_step.*)::bigint
           from workflow.workflow_steps workflow_step
          where workflow_step.run_id = any($1::text[])
         union all
         select pg_column_size(workflow_hook.*)::bigint
           from workflow.workflow_hooks workflow_hook
          where workflow_hook.run_id = any($1::text[])
         union all
         select pg_column_size(workflow_wait.*)::bigint
           from workflow.workflow_waits workflow_wait
          where workflow_wait.run_id = any($1::text[])
         union all
         select pg_column_size(stream_chunk.*)::bigint
           from workflow.workflow_stream_chunks stream_chunk
          where stream_chunk.run_id = any($1::text[])
       ) journal_row`,
    [runIds],
  );
  const bytes = Number(result.rows[0]?.bytes ?? 0);
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError("Workflow journal byte count must be a non-negative safe integer.");
  }
  return bytes;
}

async function deleteRuns(client: PoolClient, runIds: readonly string[]) {
  if (runIds.length === 0) return emptyDeletedRows();
  const streamChunks = await deleteChildren(client, "workflow_stream_chunks", runIds);
  const hooks = await deleteChildren(client, "workflow_hooks", runIds);
  const waits = await deleteChildren(client, "workflow_waits", runIds);
  const steps = await deleteChildren(client, "workflow_steps", runIds);
  const events = await deleteChildren(client, "workflow_events", runIds);
  const runs = await client.query("delete from workflow.workflow_runs where id = any($1::text[])", [
    runIds,
  ]);
  return {
    events,
    steps,
    hooks,
    waits,
    streamChunks,
    runs: runs.rowCount ?? 0,
  };
}

async function deleteChildren(
  client: PoolClient,
  tableName: Exclude<(typeof PINNED_WORKFLOW_TABLE_NAMES)[number], "workflow_runs">,
  runIds: readonly string[],
): Promise<number> {
  const result = await client.query(
    `delete from workflow.${tableName} where run_id = any($1::text[])`,
    [runIds],
  );
  return result.rowCount ?? 0;
}

function uniqueRunIds(rows: readonly RunIdRow[]): readonly string[] {
  return [...new Set(rows.map((row) => row.run_id))];
}

function validateSweepOptions(options: WorkflowJournalSweepOptions): void {
  if (Number.isNaN(options.completedBefore.getTime())) {
    throw new RangeError("completedBefore must be a valid Date.");
  }
  if (!Number.isSafeInteger(options.batchLimit) || options.batchLimit <= 0) {
    throw new RangeError("batchLimit must be a positive safe integer.");
  }
}

function emptyDeletedRows() {
  return { events: 0, steps: 0, hooks: 0, waits: 0, streamChunks: 0, runs: 0 };
}

function emptyResult(lockAcquired: boolean): WorkflowJournalSweepResult {
  return {
    lockAcquired,
    selectedRuns: 0,
    archivedRuns: 0,
    prunedRuns: 0,
    prunedBytes: 0,
    deletedRows: emptyDeletedRows(),
  };
}

async function rollbackAfterFailure(client: PoolClient, cause: unknown): Promise<never> {
  try {
    await client.query("rollback");
  } catch (rollbackError) {
    const failure = new Error("Workflow journal sweep and rollback failed.", {
      cause: rollbackError,
    });
    Object.assign(failure, { sweepCause: cause });
    throw failure;
  }
  throw cause;
}
