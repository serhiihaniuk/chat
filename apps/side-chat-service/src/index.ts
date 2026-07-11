import { serviceProcessEnv } from "#adapters/configuration/process-environment";
import { bootService } from "#bootstrap/create-service";

// Nitro opens the port only after this module finishes evaluating. A rejected
// boot therefore exposes no partially configured HTTP service.
const service = await bootService(serviceProcessEnv());

export default service.app;
