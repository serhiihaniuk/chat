import {
  createServiceCapabilityStatus,
  type ServiceCapabilityStatus,
} from "./capability-status.js";
import type { ServiceCapabilityConfig } from "./service-capability-settings.js";
import type { PersistenceConfig } from "#composition/service-composition";

/**
 * Build safe capability diagnostics from the final service config.
 *
 * Diagnostics may report capability names, ids, and adapter labels, but not
 * secrets, provider options, or context-board content.
 */
export const createCapabilityStatusForComposition = ({
  capabilityConfig,
  persistenceKind,
}: {
  readonly capabilityConfig: ServiceCapabilityConfig;
  readonly persistenceKind: PersistenceConfig["kind"];
}): ServiceCapabilityStatus =>
  createServiceCapabilityStatus({
    history: capabilityConfig.history,
    contextAdmission: capabilityConfig.contextAdmission,
    persistenceKind,
  });
