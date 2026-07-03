// Owns: building the host capability manifest from turn-profile/tool/provider
// outputs, the manifest port, the turn policy resolver, and capability status.
// Does not own: prompt text, tool execution, or per-turn policy decisions
// (the resolver only turns the manifest plus a request into a decision).

import { APPROVAL_MODES, type HostCapabilityManifest } from "@side-chat/partner-ai-core";

import { createCapabilityStatusForComposition } from "#composition/capabilities/status/service-capability-composition";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import { ServiceConfigError } from "#config/service-config-error";
import { PROVIDERS } from "#config/catalog/providers";
import {
  createServiceHostCapabilityManifest,
  createServiceTurnPolicyResolver,
  createStaticHostCapabilityManifestPort,
} from "#composition/capabilities/service-capability-manifest";
import type { TurnProfileRegistry } from "#composition/turn-profile/turn-profile-registry";
import type { ServiceProviderRegistry } from "#composition/providers/service-provider-registry";
import type { ServiceToolRegistry } from "#composition/tools/service-tool-registry";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceCapabilityBundle, ServicePersistenceBundle } from "../bundle-types.js";

export type ServiceCapabilityBundleInput = {
  readonly turnProfiles: TurnProfileRegistry;
  readonly providers: ServiceProviderRegistry;
  readonly tools: ServiceToolRegistry;
  readonly persistence: ServicePersistenceBundle;
};

/**
 * Publish what this service can offer to the stream-chat workflow.
 *
 * The manifest names available profiles, tools, and commands; turn policy still
 * chooses which of them a single request may use. Capability status is rebuilt
 * into secret-free diagnostics before routes expose readiness.
 */
export const createServiceCapabilityBundle = (
  options: ServiceCompositionOptions,
  input: ServiceCapabilityBundleInput,
): ServiceCapabilityBundle => {
  const runtimeConfig = options.runtime ?? { provider: PROVIDERS.FAKE.KIND };
  const capabilityConfig = options.capabilities ?? DEFAULT_SERVICE_CAPABILITY_CONFIG;

  const manifest = createServiceHostCapabilityManifest({
    turnProfiles: input.turnProfiles.turnProfiles,
    defaultProfileId: input.turnProfiles.defaultProfileId,
    toolCapabilities: input.tools.toolCapabilities,
    hostCommands: runtimeConfig.hostCommands,
    approvalPolicies: runtimeConfig.approvalPolicies,
  });
  assertApprovalEnforcementUnsupported(manifest);

  const capabilityStatus = createCapabilityStatusForComposition({
    capabilityConfig,
    persistenceKind:
      input.persistence.persistenceLabel === "postgres-drizzle" ? "postgres" : "memory",
  });

  return {
    manifest,
    manifestPort: createStaticHostCapabilityManifestPort(manifest),
    turnPolicyResolver: createServiceTurnPolicyResolver({
      providers: input.providers.status.providers,
    }),
    capabilityStatus,
  };
};

/**
 * Reject any approval mode other than `never` at composition, loudly.
 *
 * Approval requirements are validated end-to-end but not yet enforced (see the
 * {@link APPROVAL_MODES} contract note): nothing gates a capability on its mode
 * at run time. A silent no-op would let an adopter believe `always` is doing
 * something. Fail boot instead, naming every offender, until approval gating (and
 * the widget approval UI) ships.
 */
const assertApprovalEnforcementUnsupported = (manifest: HostCapabilityManifest): void => {
  const offenders = [
    ...manifest.approvalPolicies
      .filter((policy) => policy.mode !== APPROVAL_MODES.NEVER)
      .map((policy) => `approval policy "${policy.policyId}" (mode "${policy.mode}")`),
    ...manifest.commands
      .filter((command) => command.approvalMode !== APPROVAL_MODES.NEVER)
      .map(
        (command) =>
          `host command "${command.commandName}" (approvalMode "${command.approvalMode}")`,
      ),
  ];
  if (offenders.length === 0) return;

  throw new ServiceConfigError(
    `Approval enforcement is not implemented, but ${offenders.join(", ")} request it. ` +
      `Set every approval mode to "${APPROVAL_MODES.NEVER}" until approval gating ships (plan/24).`,
  );
};
