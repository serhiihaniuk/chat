/**
 * Workflow steps execute in a different Nitro module instance from routes.
 * This registry therefore owns only workflow-bundle services. Route composition
 * must never assume that initializing its own module instance initializes this one.
 */
export type WorkflowServices = Readonly<{ readonly composition: "production" | "testing" }>;

let initializedServices: WorkflowServices | undefined;

export function initializeWorkflowServices(services: WorkflowServices): void {
  if (initializedServices !== undefined) {
    throw new Error("Workflow services are already initialized in this module instance");
  }
  initializedServices = Object.freeze(services);
}

export function workflowServices(): WorkflowServices {
  if (initializedServices === undefined) {
    throw new Error("Workflow services were used before composition initialized them");
  }
  return initializedServices;
}

/** Testing composition owns reset so state never leaks between disposable runs. */
export function resetWorkflowServicesForTesting(): void {
  initializedServices = undefined;
}
