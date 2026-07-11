import { createCompatibilityApp } from "#adapters/http/compatibility-app";
import { createHttpApp } from "#adapters/http/health-app";
import type { Settings } from "#config/settings/resolve-settings";

import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";

export async function startTestingService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  const scope = await startServiceScope(settings, starters);
  const app = createHttpApp(scope);
  app.route("/", createCompatibilityApp());
  return { app, scope };
}
