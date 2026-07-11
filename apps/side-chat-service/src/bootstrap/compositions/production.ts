import type { Settings } from "#application/configuration/resolve-settings";
import { createHttpApp } from "#adapters/inbound/http/health-app";

import { startServiceScope, type StartServicePart } from "../resource-scope.js";

/** Production wiring contains no scripted providers or compatibility-only routes. */
export async function startProductionService(
  settings: Settings,
  starters: readonly StartServicePart[] = [],
) {
  const scope = await startServiceScope(settings, starters);
  return { app: createHttpApp(scope), scope };
}
