import type { ServiceEnv } from "#config/declaration/side-chat-config";

import { resolveServiceSettings } from "../settings/resolve-service-settings.js";
import { startProductionService } from "./production.js";

export async function bootProductionService(env: ServiceEnv) {
  return startProductionService(resolveServiceSettings(env));
}

export { resolveServiceSettings } from "../settings/resolve-service-settings.js";
