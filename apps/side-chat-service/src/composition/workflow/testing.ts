import { scriptedModelProvider } from "#testing/scripted-language-model";
import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import {
  envValue,
  serviceProcessEnv,
} from "#config/environment/process-environment";
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
    const databaseUrl = envValue(
      serviceProcessEnv(),
      SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL,
    );
    initializeWorkflowServices({
      modelProvider: scriptedModelProvider,
      ...(databaseUrl === undefined ? {} : { databaseUrl }),
    });
  }
  return workflowServices();
}

export function resetTestingWorkflowServices(): void {
  resetWorkflowServices();
}
