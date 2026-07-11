import { scriptedModelProvider } from "#testing/scripted-language-model";
import {
  initializeWorkflowServices,
  resetWorkflowServices,
  workflowServices,
  workflowServicesAreInitialized,
  type WorkflowServices,
} from "#workflows/registry";

/** Initialize dependencies in the workflow bundle, not the route-bundle module instance. */
export function initializeTestingWorkflowServices(): WorkflowServices {
  if (!workflowServicesAreInitialized()) {
    initializeWorkflowServices({ modelProvider: scriptedModelProvider });
  }
  return workflowServices();
}

export function resetTestingWorkflowServices(): void {
  resetWorkflowServices();
}
