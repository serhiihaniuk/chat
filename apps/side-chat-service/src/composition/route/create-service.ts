import type { ServiceEnv } from "#config/declaration/side-chat-config";

import { resolveServiceSettings } from "../settings/resolve-service-settings.js";
import { recordServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import { createShutdownCoordinator } from "../lifecycle/process/shutdown-coordinator.js";
import { startWorkflowWorld } from "../lifecycle/process/workflow-world.js";
import { startProductionService } from "./production.js";

export async function bootProductionService(env: ServiceEnv) {
  const settings = resolveServiceSettings(env);
  const world = await startWorkflowWorld();
  try {
    const service = await startProductionService(settings);
    const lifecycle = createShutdownCoordinator({
      admission: service.admission,
      scope: service.scope,
      closeStreams: service.closeStreams,
      closeWorld: world.close,
      drainBudgetMs: settings.capacity.drainBudgetMs,
      telemetry: { record: recordServiceTelemetry },
    });
    return { ...service, lifecycle };
  } catch (error) {
    await world.close();
    throw error;
  }
}

export { resolveServiceSettings } from "../settings/resolve-service-settings.js";
