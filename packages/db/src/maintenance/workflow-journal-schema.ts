/**
 * Exact external Postgres World schema supported by the maintenance adapter.
 *
 * These identifiers belong to the pinned Workflow dependency, not Side Chat.
 * Update them only with that dependency and its compatibility verification;
 * accepting an approximate shape could make archival or pruning lose rows.
 */
const WORKFLOW_TABLE_COLUMNS = {
  workflow_events: [
    "correlation_id",
    "created_at",
    "id",
    "payload",
    "payload_cbor",
    "run_id",
    "spec_version",
    "type",
  ],
  workflow_hooks: [
    "created_at",
    "environment",
    "hook_id",
    "is_system",
    "is_webhook",
    "metadata",
    "metadata_cbor",
    "owner_id",
    "project_id",
    "run_id",
    "spec_version",
    "token",
  ],
  workflow_runs: [
    "attributes",
    "completed_at",
    "created_at",
    "deployment_id",
    "error",
    "error_cbor",
    "error_code",
    "execution_context",
    "execution_context_cbor",
    "expired_at",
    "id",
    "input",
    "input_cbor",
    "name",
    "output",
    "output_cbor",
    "spec_version",
    "started_at",
    "status",
    "updated_at",
  ],
  workflow_steps: [
    "attempt",
    "completed_at",
    "created_at",
    "error",
    "error_cbor",
    "input",
    "input_cbor",
    "output",
    "output_cbor",
    "retry_after",
    "run_id",
    "spec_version",
    "started_at",
    "status",
    "step_id",
    "step_name",
    "updated_at",
  ],
  workflow_stream_chunks: ["created_at", "data", "eof", "id", "run_id", "stream_id"],
  workflow_waits: [
    "completed_at",
    "created_at",
    "resume_at",
    "run_id",
    "spec_version",
    "status",
    "updated_at",
    "wait_id",
  ],
} as const;

export const PINNED_WORKFLOW_TABLE_NAMES = [
  "workflow_events",
  "workflow_hooks",
  "workflow_runs",
  "workflow_steps",
  "workflow_stream_chunks",
  "workflow_waits",
] as const;

const PINNED_WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export class WorkflowJournalSchemaError extends Error {
  readonly code = "workflow_journal_schema_mismatch";

  constructor(message: string) {
    super(message);
    this.name = "WorkflowJournalSchemaError";
  }
}

export type WorkflowJournalSchemaShape = Readonly<{
  tables: Readonly<Record<string, readonly string[]>>;
  runStatuses: readonly string[];
}>;

/** Assert the exact table, column, and run-status contract pinned by this adapter. */
export function assertPinnedWorkflowJournalSchema(shape: WorkflowJournalSchemaShape): void {
  assertSameValues("workflow tables", PINNED_WORKFLOW_TABLE_NAMES, Object.keys(shape.tables));
  for (const tableName of PINNED_WORKFLOW_TABLE_NAMES) {
    assertSameValues(
      `${tableName} columns`,
      WORKFLOW_TABLE_COLUMNS[tableName],
      shape.tables[tableName] ?? [],
    );
  }
  assertSameValues("workflow run statuses", PINNED_WORKFLOW_RUN_STATUSES, shape.runStatuses);
}

function assertSameValues(
  label: string,
  expected: readonly string[],
  actual: readonly string[],
): void {
  const expectedValues = [...expected].sort();
  const actualValues = [...actual].sort();
  const sameLength = expectedValues.length === actualValues.length;
  if (sameLength && expectedValues.every((value, index) => value === actualValues[index])) return;
  throw new WorkflowJournalSchemaError(
    `${label} do not match the pinned Postgres World schema: expected [${expectedValues.join(", ")}], received [${actualValues.join(", ")}].`,
  );
}
