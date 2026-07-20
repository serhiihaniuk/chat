import { scriptedModelProvider } from "#testing/scripted-language-model";
import { selectRegisteredServerTools } from "#sidechat";
import { BUNDLED_CONFIG_NAMES } from "#config/declaration/bundled-config-catalog";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { serviceProcessEnv } from "#config/environment/process-environment";
import {
  initializeWorkflowServices,
  resetWorkflowServices,
  workflowServices,
  workflowServicesAreInitialized,
  type WorkflowServices,
} from "#workflows/registry";

import { resolveServiceSettings } from "../settings/resolve-service-settings.js";

/** Initialize dependencies in the workflow bundle, not the route-bundle module instance. */
export function initializeTestingWorkflowServices(): WorkflowServices {
  if (!workflowServicesAreInitialized()) {
    const settings = resolveServiceSettings({
      ...serviceProcessEnv(),
      [SERVICE_ENV_KEYS.CONFIG_NAME]: BUNDLED_CONFIG_NAMES.FAKE,
    });
    const databaseUrl = settings.persistence.databaseUrl;
    initializeWorkflowServices({
      modelProvider: scriptedModelProvider,
      serverTools: selectRegisteredServerTools(settings.serverTools),
      ...(databaseUrl === undefined ? {} : { databaseUrl }),
    });
  }
  return workflowServices();
}

export function resetTestingWorkflowServices(): void {
  resetWorkflowServices();
}
