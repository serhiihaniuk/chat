import type { Settings } from "#application/configuration/resolve-settings";
import compatibilityApp from "#adapters/inbound/http/compatibility-app";
import { createHttpApp } from "#adapters/inbound/http/health-app";
import { resetWorkflowServicesForTesting } from "#adapters/outbound/workflow/workflow-service-registry";

import { startServiceScope, type StartServicePart } from "../resource-scope.js";

export async function startTestingService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  const scope = await startServiceScope(settings, starters);
  const app = createHttpApp(scope);
  app.route("/", compatibilityApp);
  return {
    app,
    scope: {
      ...scope,
      close: async () => {
        try {
          await scope.close();
        } finally {
          resetWorkflowServicesForTesting();
        }
      },
    },
  };
}
