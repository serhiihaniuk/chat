// Owns: building the host capability manifest from assistant/tool/provider
// outputs, the manifest port, the turn policy resolver, and capability status.
// Does not own: assistant prompts, tool execution, or per-turn policy decisions
// (the resolver only turns the manifest plus a request into a decision).

import { createCapabilityStatusForComposition } from "#composition/capabilities/service-capability-composition";
import { DEFAULT_SERVICE_CAPABILITY_CONFIG } from "#composition/capabilities/service-capability-settings";
import {
  createServiceHostCapabilityManifest,
  createServiceTurnPolicyResolver,
  createStaticHostCapabilityManifestPort,
} from "#composition/manifest/service-capability-manifest";
import type { AssistantProfileRegistry } from "#composition/assistant/assistant-profile-registry";
import type { ServiceToolRegistry } from "#composition/tools/service-tool-registry";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceCapabilityBundle, ServicePersistenceBundle } from "./bundle-types.js";

export type ServiceCapabilityBundleInput = {
  readonly assistants: AssistantProfileRegistry;
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
  const runtimeConfig = options.runtime ?? { provider: "fake" };
  const capabilityConfig = options.capabilities ?? DEFAULT_SERVICE_CAPABILITY_CONFIG;

  const manifest = createServiceHostCapabilityManifest({
    assistantProfiles: input.assistants.assistantProfiles,
    defaultProfileId: input.assistants.defaultProfileId,
    toolCapabilities: input.tools.toolCapabilities,
    hostCommands: runtimeConfig.hostCommands,
    approvalPolicies: runtimeConfig.approvalPolicies,
  });

  const capabilityStatus = createCapabilityStatusForComposition({
    capabilityConfig,
    persistenceKind:
      input.persistence.persistenceLabel === "postgres-drizzle" ? "postgres" : "memory",
  });

  return {
    manifest,
    manifestPort: createStaticHostCapabilityManifestPort(manifest),
    turnPolicyResolver: createServiceTurnPolicyResolver(),
    capabilityStatus,
  };
};
