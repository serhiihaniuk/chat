import type { PoolClient, QueryResultRow } from "pg";

import type { OldestNonterminalWorkflowRun } from "../workflow-journal-maintenance.js";
import {
  assertPinnedWorkflowJournalSchema,
  PINNED_WORKFLOW_TABLE_NAMES,
} from "../workflow-journal-schema.js";

const NONTERMINAL_WORKFLOW_STATUSES = ["pending", "running"] as const;

type Queryable = Readonly<{ query: PoolClient["query"] }>;
type SchemaColumnRow = QueryResultRow & Readonly<{ table_name: string; column_name: string }>;
type EnumLabelRow = QueryResultRow & Readonly<{ enumlabel: string }>;
type OldestNonterminalRunRow = QueryResultRow & Readonly<{ started_at: Date; age_ms: string }>;

export async function readOldestNonterminalRun(
  queryable: Queryable,
  now: Date,
): Promise<OldestNonterminalWorkflowRun | undefined> {
  if (Number.isNaN(now.getTime())) throw new RangeError("now must be a valid Date.");
  const result = await queryable.query<OldestNonterminalRunRow>(
    `select coalesce(started_at, created_at) as started_at,
            extract(epoch from ($1::timestamptz - coalesce(started_at, created_at))) * 1000
              as age_ms
       from workflow.workflow_runs
      where status = any($2::workflow.status[])
      order by coalesce(started_at, created_at), id
      limit 1`,
    [now, NONTERMINAL_WORKFLOW_STATUSES],
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return { startedAt: row.started_at, ageMs: Number(row.age_ms) };
}

export async function validatePinnedSchema(queryable: Queryable): Promise<void> {
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
