import { initializeWorkflowServices, type WorkflowServices } from "#workflows/registry";

/** Production workflow bundles initialize their application ports explicitly. */
export function initializeProductionWorkflowServices(services: WorkflowServices): void {
  initializeWorkflowServices(services);
}
