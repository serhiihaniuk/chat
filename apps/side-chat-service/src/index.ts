import { bootProductionService } from "#composition/route/create-service";
import { serviceProcessEnv } from "#config/environment/process-environment";

// Nitro opens the port only after this module finishes evaluating. A rejected
// boot therefore exposes no partially configured HTTP service.
const service = await bootProductionService(serviceProcessEnv());

export default service.app;
