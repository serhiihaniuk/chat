import { createHttpApp } from "#adapters/http/health/health-app";
import { createStaticTokenAuthorizer } from "#adapters/auth/static-token-authorizer";
import type { Settings } from "#config/settings/resolve-settings";

import { assertAiSdkDefaultProviderIsUnset } from "../lifecycle/ai-sdk-global-guard.js";
import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";
import { createWorkflowReadiness } from "../lifecycle/readiness/workflow-readiness.js";
import { createProductionModelProvider } from "../providers/production-model-provider.js";
import { startConfiguredTelemetry } from "../lifecycle/telemetry/configured-telemetry.js";

/** Production wiring contains no scripted providers or compatibility-only routes. */
export async function startProductionService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  assertAiSdkDefaultProviderIsUnset();
  const modelProvider = createProductionModelProvider(settings);
  const authorizer = createStaticTokenAuthorizer(settings.auth);
  const scope = await startServiceScope(settings, [startConfiguredTelemetry, ...starters]);
  return {
    app: createHttpApp(createWorkflowReadiness(scope, settings), authorizer),
    modelProvider,
    scope,
  };
}
