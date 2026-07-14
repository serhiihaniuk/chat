import { serviceProcessEnv } from "#config/environment/process-environment";
import { selectRegisteredServerTools } from "#application/turn/tools/server-tools/registered-server-tools";
import type { ServerToolDefinition } from "#application/turn/tools/server-tools/server-tool-catalog";
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
      serverTools: selectRegisteredServerTools(settings.serverTools),
      ...(settings.persistence.databaseUrl === undefined
        ? {}
        : { databaseUrl: settings.persistence.databaseUrl }),
    });
  }
  return workflowServices();
}

/** Reload the deployment-selected definition inside a post-approval step. */
export function findConfiguredProductionServerTool(name: string): ServerToolDefinition | undefined {
  const settings = resolveServiceSettings(serviceProcessEnv());
  return selectRegisteredServerTools(settings.serverTools).find(
    (definition) => definition.name === name,
  );
}
