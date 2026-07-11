import { createHttpApp } from "#adapters/http/health-app";
import type { Settings } from "#config/settings/resolve-settings";

import { startServiceScope, type StartServicePart } from "../lifecycle/resource-scope.js";

/** Production wiring contains no scripted providers or compatibility-only routes. */
export async function startProductionService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  const scope = await startServiceScope(settings, starters);
  return { app: createHttpApp(scope), scope };
}
