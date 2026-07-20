import type { ModelProvider } from "#application/ports/model-provider";
import type { ServerToolDefinition } from "@side-chat/side-chat-server";

/**
 * Workflow steps execute in a different Nitro module instance from routes.
 * This registry owns only dependencies used inside that physical bundle. Its
 * initializer must therefore execute from workflow-bundle composition; route
 * composition cannot initialize this module instance on the workflow's behalf.
 */
export type WorkflowServices = Readonly<{
  readonly modelProvider: ModelProvider;
  readonly serverTools: readonly ServerToolDefinition[];
  readonly databaseUrl?: string;
}>;

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

export function workflowServicesAreInitialized(): boolean {
  return initializedServices !== undefined;
}

/** Registry reset is exposed only for the testing composition's disposable bundle. */
export function resetWorkflowServices(): void {
  initializedServices = undefined;
}
