import { pgSchema, text } from "drizzle-orm/pg-core";

const workflow = pgSchema("workflow");

/**
 * Narrow read projection over the pinned Postgres World run table.
 *
 * It intentionally exposes only identity and lifecycle. Workflow input, output,
 * errors, attributes, and journal rows stay outside the product repository.
 */
export const workflowRunsRead = workflow.table("workflow_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
});

export const ACTIVE_WORKFLOW_RUN_STATUSES = new Set<string>(["pending", "running"]);
export const TERMINAL_WORKFLOW_RUN_STATUSES = new Set<string>(["completed", "failed", "cancelled"]);

export const isActiveWorkflowRunStatus = (status: string | null): boolean =>
  status !== null && ACTIVE_WORKFLOW_RUN_STATUSES.has(status);

export const isTerminalWorkflowRunStatus = (status: string | null): boolean =>
  status !== null && TERMINAL_WORKFLOW_RUN_STATUSES.has(status);
