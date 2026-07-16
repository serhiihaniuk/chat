import { bootProductionService } from "#composition/route/create-service";
import { serviceProcessEnv } from "#config/environment/process-environment";
import { publishProcessLifecycle } from "#composition/lifecycle/process/process-lifecycle";

// Nitro opens the port only after this module finishes evaluating. A rejected
// boot therefore exposes no partially configured HTTP service.
const service = await bootProductionService(serviceProcessEnv());
publishProcessLifecycle(service.lifecycle);

export default service.app;
