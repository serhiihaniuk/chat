import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { envValue, serviceProcessEnv } from "#config/environment/process-environment";
import { BoundedTurnAdmission } from "#adapters/capacity/bounded-turn-admission";
import { recordServiceTelemetry } from "#adapters/telemetry/ai-sdk-telemetry";
import { createShutdownCoordinator } from "../lifecycle/process/shutdown-coordinator.js";
import { publishProcessLifecycle } from "../lifecycle/process/process-lifecycle.js";
import { startWorkflowWorld } from "../lifecycle/process/workflow-world.js";

import { startTestingServiceWithConfiguredPersistence } from "./testing.js";
import { resolveServiceSettings } from "../settings/resolve-service-settings.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { startTestingChatTurn } from "#workflows/testing/chat-turn";
import { resumeTestingClientToolResult } from "#workflows/testing/client-tool-result";

// A compiled restart test must have enough time to stop one Windows process
// and bind another before the durable client-tool timeout wins the race.
const COMPILED_CLIENT_TOOL_TIMEOUT_MS = 5_000;
const COMPILED_PROVIDER_TIMEOUT_MS = 20_000;
const environment = serviceProcessEnv();
const resolvedSettings = resolveServiceSettings(environment);
const databaseUrl = envValue(environment, SERVICE_ENV_KEYS.SIDECHAT_DATABASE_URL);
const settings = {
  ...resolvedSettings,
  timeouts: {
    ...resolvedSettings.timeouts,
    clientToolMs: COMPILED_CLIENT_TOOL_TIMEOUT_MS,
    providerMs: COMPILED_PROVIDER_TIMEOUT_MS,
  },
  persistence: { databaseUrl },
};
const world = await startWorkflowWorld();
const admission = new BoundedTurnAdmission({
  ...settings.capacity,
  telemetry: { record: recordServiceTelemetry },
});
let service;
try {
  service = await startTestingServiceWithConfiguredPersistence(settings, [], {
    turnExecution: createWorkflowTurnExecution(settings, startTestingChatTurn),
    turnAdmission: admission,
    turnReplay: createWorkflowTurnReplay(),
    resumeClientTool: resumeTestingClientToolResult,
  });
} catch (error) {
  await world.close();
  throw error;
}
const lifecycle = createShutdownCoordinator({
  admission,
  scope: service.scope,
  closeStreams: service.closeStreams,
  closeWorld: world.close,
  drainBudgetMs: settings.capacity.drainBudgetMs,
  telemetry: { record: recordServiceTelemetry },
});
publishProcessLifecycle(lifecycle);

export default service.app;
