import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";

import {
  assertPinnedWorkflowJournalSchema,
  PINNED_WORKFLOW_TABLE_NAMES,
} from "./workflow-journal-schema.js";
import {
  readWorkflowJournalSnapshot,
  type WorkflowJournalSnapshot,
} from "./workflow-journal-archive.js";

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
  deletedRows: Readonly<{
    events: number;
    steps: number;
    hooks: number;
    waits: number;
    streamChunks: number;
    runs: number;
  }>;
}>;

export type WorkflowJournalMaintenance = Readonly<{
  validateSchema: () => Promise<void>;
  sweep: (options: WorkflowJournalSweepOptions) => Promise<WorkflowJournalSweepResult>;
  close: () => Promise<void>;
}>;

/** Build the Postgres World maintenance adapter over its dedicated connection pool. */
export function createPostgresWorkflowJournalMaintenance(options: {
  readonly connectionString: string;
  readonly pool?: PoolConfig | undefined;
  readonly archive?: ArchiveWorkflowJournal | undefined;
}): WorkflowJournalMaintenance {
  const pool = new Pool({ ...options.pool, connectionString: options.connectionString });
  const validateSchema = () => validatePinnedSchema(pool);
  return {
    validateSchema,
    sweep: (sweepOptions) => runSweep(pool, sweepOptions, options.archive),
    close: () => pool.end(),
  };
}

type Queryable = Readonly<{
  query: PoolClient["query"];
}>;

type SchemaColumnRow = QueryResultRow & Readonly<{ table_name: string; column_name: string }>;
type EnumLabelRow = QueryResultRow & Readonly<{ enumlabel: string }>;
type LockRow = QueryResultRow & Readonly<{ acquired: boolean }>;
type RunIdRow = QueryResultRow & Readonly<{ run_id: string }>;

async function validatePinnedSchema(queryable: Queryable): Promise<void> {
  const columns = await queryable.query<SchemaColumnRow>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = 'workflow'
        and table_name = any($1::text[])
      order by table_name, column_name`,
    [PINNED_WORKFLOW_TABLE_NAMES],
  );
  const statuses = await queryable.query<EnumLabelRow>(
    `select enum_value.enumlabel
       from pg_type enum_type
       join pg_namespace namespace on namespace.oid = enum_type.typnamespace
       join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
      where namespace.nspname = 'workflow'
        and enum_type.typname = 'status'
      order by enum_value.enumsortorder`,
  );

  assertPinnedWorkflowJournalSchema({
    tables: groupColumns(columns.rows),
    runStatuses: statuses.rows.map((row) => row.enumlabel),
  });
}

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
    const deletedRows = await deleteRuns(client, runIds);
    await client.query("commit");
    return {
      lockAcquired: true,
      selectedRuns: runIds.length,
      archivedRuns,
      prunedRuns: deletedRows.runs,
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
  return { events, steps, hooks, waits, streamChunks, runs: runs.rowCount ?? 0 };
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

function groupColumns(
  rows: readonly SchemaColumnRow[],
): Readonly<Record<string, readonly string[]>> {
  const tables: Record<string, string[]> = {};
  for (const row of rows) {
    const columns = tables[row.table_name] ?? [];
    columns.push(row.column_name);
    tables[row.table_name] = columns;
  }
  return tables;
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
