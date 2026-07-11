import { createCompatibilityApp } from "#adapters/http/compatibility-app";
import { createHttpApp, type Readiness } from "#adapters/http/health/health-app";
import { createStaticTokenAuthorizer } from "#adapters/auth/static-token-authorizer";
import { registerServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import type { ModelProvider } from "#application/ports/model-provider";
import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { Settings } from "#config/settings/resolve-settings";
import { scriptedModelProvider } from "#testing/scripted-language-model";

import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";

export async function startTestingService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
  overrides: Readonly<{
    authorizer?: RequestAuthorizer;
    modelProvider?: ModelProvider;
    readiness?: Readiness;
    telemetrySink?: TelemetrySink;
  }> = {},
) {
  if (overrides.telemetrySink !== undefined) registerServiceTelemetry(overrides.telemetrySink);
  const scope = await startServiceScope(settings, starters);
  const readiness = overrides.readiness ?? { check: () => scope.isReady() };
  const authorizer = overrides.authorizer ?? createStaticTokenAuthorizer(settings.auth);
  const app = createHttpApp(readiness, authorizer);
  app.route("/", createCompatibilityApp());
  return {
    app,
    modelProvider: overrides.modelProvider ?? scriptedModelProvider,
    scope,
  };
}
