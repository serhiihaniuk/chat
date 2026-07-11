import { serviceProcessEnv } from "#config/environment/process-environment";

import { startTestingService } from "./testing.js";
import { resolveServiceSettings } from "../settings/resolve-service-settings.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { createWorkflowTurnReplay } from "../turn/replay/workflow-turn-replay.js";
import { startTestingChatTurn } from "#workflows/testing/chat-turn";

const settings = resolveServiceSettings(serviceProcessEnv());
const service = await startTestingService(settings, [], {
  turnExecution: createWorkflowTurnExecution(settings, startTestingChatTurn),
  turnReplay: createWorkflowTurnReplay(),
});

export default service.app;
