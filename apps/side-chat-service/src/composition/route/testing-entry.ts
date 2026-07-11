import { serviceProcessEnv } from "#config/environment/process-environment";

import { resolveServiceSettings } from "./create-service.js";
import { startTestingService } from "./testing.js";

const service = await startTestingService(resolveServiceSettings(serviceProcessEnv()));

export default service.app;
