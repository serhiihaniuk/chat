import { serviceProcessEnv } from "#config/environment/process-environment";

import { resolveServiceSettings } from "./create-service.js";
import { startTestingService } from "./testing.js";
import { createWorkflowTurnExecution } from "../turn/workflow-turn-execution.js";
import { startTestingChatTurn } from "#workflows/testing/chat-turn";

const settings = resolveServiceSettings(serviceProcessEnv());
const service = await startTestingService(settings, [], {
  turnExecution: createWorkflowTurnExecution(settings, startTestingChatTurn),
});

export default service.app;
