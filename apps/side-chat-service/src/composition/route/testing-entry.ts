import { SERVICE_ENV_KEYS } from "#config/declaration/side-chat-config";
import { envValue, serviceProcessEnv } from "#config/environment/process-environment";

import { startTestingServiceWithConfiguredPersistence } from "./testing.js";
import { resolveServiceSettings } from "../settings/resolve-service-settings.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { PASS_THROUGH_TURN_ADMISSION } from "../turn/pass-through-admission.js";
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
const service = await startTestingServiceWithConfiguredPersistence(settings, [], {
  turnExecution: createWorkflowTurnExecution(settings, startTestingChatTurn),
  turnAdmission: PASS_THROUGH_TURN_ADMISSION,
  turnReplay: createWorkflowTurnReplay(),
  resumeClientTool: resumeTestingClientToolResult,
});

export default service.app;
