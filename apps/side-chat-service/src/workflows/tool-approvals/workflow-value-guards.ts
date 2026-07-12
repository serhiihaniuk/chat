/** Workflow bundles cannot import the shared package, so unknown-value narrowing stays local. */
export function isWorkflowRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
