import type { PoolClient } from "pg";

export type WorkflowJournalRow = Readonly<Record<string, unknown>>;

/**
 * Complete raw rows from every pinned Postgres World table owned by one run.
 *
 * Inputs, outputs, errors, hook metadata, and stream chunks may contain private
 * conversation or provider data. Treat this snapshot as sensitive persistence,
 * not as a log or diagnostic payload.
 */
export type WorkflowJournalSnapshot = Readonly<{
  runId: string;
  runs: readonly WorkflowJournalRow[];
  events: readonly WorkflowJournalRow[];
  steps: readonly WorkflowJournalRow[];
  hooks: readonly WorkflowJournalRow[];
  waits: readonly WorkflowJournalRow[];
  streamChunks: readonly WorkflowJournalRow[];
}>;

/** Read one run's private six-table image before hot-journal deletion. */
export async function readWorkflowJournalSnapshot(
  client: PoolClient,
  runId: string,
): Promise<WorkflowJournalSnapshot> {
  const runs = await readRows(client, "select * from workflow.workflow_runs where id = $1", runId);
  const events = await readRows(
    client,
    "select * from workflow.workflow_events where run_id = $1 order by id",
    runId,
  );
  const steps = await readRows(
    client,
    "select * from workflow.workflow_steps where run_id = $1 order by step_id",
    runId,
  );
  const hooks = await readRows(
    client,
    "select * from workflow.workflow_hooks where run_id = $1 order by hook_id",
    runId,
  );
  const waits = await readRows(
    client,
    "select * from workflow.workflow_waits where run_id = $1 order by wait_id",
    runId,
  );
  const streamChunks = await readRows(
    client,
    "select * from workflow.workflow_stream_chunks where run_id = $1 order by stream_id, id",
    runId,
  );
  return { runId, runs, events, steps, hooks, waits, streamChunks };
}

async function readRows(
  client: PoolClient,
  query: string,
  runId: string,
): Promise<readonly WorkflowJournalRow[]> {
  const result = await client.query<WorkflowJournalRow>(query, [runId]);
  return result.rows;
}
