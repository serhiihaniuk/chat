import { describe, expect, it } from "vitest";

import {
  assertPinnedWorkflowJournalSchema,
  WorkflowJournalSchemaError,
  type WorkflowJournalSchemaShape,
} from "./workflow-journal-maintenance.js";

const PINNED_SCHEMA: WorkflowJournalSchemaShape = {
  tables: {
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
  },
  runStatuses: ["pending", "running", "completed", "failed", "cancelled"],
};

describe("Workflow journal pinned-schema validation", () => {
  it("accepts the exact installed Postgres World contract independent of row order", () => {
    const reversed = Object.fromEntries(
      Object.entries(PINNED_SCHEMA.tables).map(([table, columns]) => [
        table,
        [...columns].reverse(),
      ]),
    );

    expect(() =>
      assertPinnedWorkflowJournalSchema({
        tables: reversed,
        runStatuses: [...PINNED_SCHEMA.runStatuses].reverse(),
      }),
    ).not.toThrow();
  });

  it("fails closed when a pinned table or column disappears", () => {
    expect(() =>
      assertPinnedWorkflowJournalSchema({
        ...PINNED_SCHEMA,
        tables: {
          ...PINNED_SCHEMA.tables,
          workflow_runs: (PINNED_SCHEMA.tables["workflow_runs"] ?? []).filter(
            (column) => column !== "completed_at",
          ),
        },
      }),
    ).toThrowError(WorkflowJournalSchemaError);

    const withoutWaits = Object.fromEntries(
      Object.entries(PINNED_SCHEMA.tables).filter(([table]) => table !== "workflow_waits"),
    );
    expect(() =>
      assertPinnedWorkflowJournalSchema({ ...PINNED_SCHEMA, tables: withoutWaits }),
    ).toThrowError(/workflow tables/);
  });

  it("fails closed when the Workflow run status vocabulary drifts", () => {
    expect(() =>
      assertPinnedWorkflowJournalSchema({
        ...PINNED_SCHEMA,
        runStatuses: [...PINNED_SCHEMA.runStatuses, "paused"],
      }),
    ).toThrowError(/workflow run statuses/);
  });
});
