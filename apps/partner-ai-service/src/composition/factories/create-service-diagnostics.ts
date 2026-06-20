// Owns: assembling the secret-free diagnostics object health/models routes read.
// Does not own: any secret, provider option, or context-board content; it only
// re-presents labels and status already produced by the other factories.

import type {
  ServiceTurnProfileBundle,
  ServiceDiagnostics,
  ServicePersistenceBundle,
  ServiceProviderBundle,
  ServiceToolBundle,
} from "./bundle-types.js";

export type ServiceDiagnosticsInput = {
  readonly persistence: ServicePersistenceBundle;
  readonly providers: ServiceProviderBundle;
  readonly tools: ServiceToolBundle;
  readonly turnProfiles: ServiceTurnProfileBundle;
};

/**
 * Re-present the selected runtime ids, registry status, and adapter label.
 *
 * Health and models routes read these instead of reaching back into provider
 * registrations or repositories, so the diagnostics surface can never leak
 * secrets that live behind the registries.
 */
export const createServiceDiagnostics = (input: ServiceDiagnosticsInput): ServiceDiagnostics => ({
  runtimeProviderId: input.providers.defaultProviderId,
  runtimeModelId: input.providers.defaultModelId,
  providerRegistryStatus: input.providers.registry.status,
  toolRegistryStatus: input.tools.registry.status,
  turnProfiles: input.turnProfiles.registry.serviceProfiles,
  persistenceLabel: input.persistence.persistenceLabel,
});
