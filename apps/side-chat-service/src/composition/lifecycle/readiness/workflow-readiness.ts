import { getWorld, healthCheck } from "workflow/runtime";

import type { Readiness } from "#adapters/http/health/health-app";
import type { Settings } from "#config/settings/resolve-settings";

import type { StartedServiceScope } from "../resource-scope.js";

export interface WorkflowHealthProbe {
  readonly check: (timeoutMs: number) => Promise<boolean>;
}

export const workflowSdkHealthProbe: WorkflowHealthProbe = {
  check: async (timeoutMs) => {
    const world = await getWorld();
    return (await healthCheck(world, "workflow", { timeout: timeoutMs })).healthy;
  },
};

/** Probe the world selected by Workflow/Nitro; never create a parallel worker or database. */
export function createWorkflowReadiness(
  scope: StartedServiceScope,
  settings: Settings,
  probe: WorkflowHealthProbe = workflowSdkHealthProbe,
): Readiness {
  return {
    check: async () => {
      if (!scope.isReady()) return false;
      try {
        return await probe.check(settings.timeouts.queueMs);
      } catch {
        return false;
      }
    },
  };
}
