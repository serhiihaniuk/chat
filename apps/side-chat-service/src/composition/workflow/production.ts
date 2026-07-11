import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  initializeWorkflowServices,
  workflowServices,
  workflowServicesAreInitialized,
  type WorkflowServices,
} from "#workflows/registry";

import { createProductionModelProvider } from "../providers/production-model-provider.js";
import { resolveServiceSettings } from "../settings/resolve-service-settings.js";

/** Resolve production dependencies inside the workflow bundle's module realm. */
export function initializeProductionWorkflowServices(): WorkflowServices {
  if (!workflowServicesAreInitialized()) {
    const settings = resolveServiceSettings(serviceProcessEnv());
    initializeWorkflowServices({
      modelProvider: createProductionModelProvider(settings),
      ...(settings.persistence.databaseUrl === undefined
        ? {}
        : { databaseUrl: settings.persistence.databaseUrl }),
    });
  }
  return workflowServices();
}
