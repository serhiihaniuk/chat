/**
 * Build service config into manifest-ready turn profiles before routes start.
 *
 * Provider, tool, and guard registries are validation inputs here. This factory
 * returns the checked profile registry and prompt builder; later factories
 * publish the manifest and wire runtime ports.
 */

import { createTurnProfileRegistry } from "#composition/turn-profile/turn-profile-registry";
import {
  createDefaultTurnProfileConfig,
  DEFAULT_TURN_PROFILE_ID,
} from "#composition/turn-profile/default-turn-profile-config";
import { createDefaultSystemPromptBuilder } from "#composition/turn-profile/system-prompt-builder";
import type { ServiceProviderRegistry } from "#composition/providers/service-provider-registry";
import type { ServiceToolRegistry } from "#composition/tools/service-tool-registry";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceTurnProfileBundle } from "./bundle-types.js";

export type ServiceTurnProfileBundleInput = {
  readonly providers: ServiceProviderRegistry;
  readonly tools: ServiceToolRegistry;
  /** Guard ids the built-in default turn profile selects for its safety policy. */
  readonly turnGuardIds: readonly string[];
  /** Guard ids registered by the turn guard registry; the validation set. */
  readonly registeredGuardIds: readonly string[];
};

/**
 * Build turn profiles before the manifest publishes them.
 *
 * Falls back to the built-in default turn profile when no turn profiles are
 * provided, and validates every profile against the provider, tool, and guard
 * registries before any route serves traffic. System prompts are built here,
 * not inside the manifest helper.
 */
export const createServiceTurnProfileBundle = (
  options: ServiceCompositionOptions,
  input: ServiceTurnProfileBundleInput,
): ServiceTurnProfileBundle => {
  const promptBuilder = createDefaultSystemPromptBuilder();
  const turnProfiles = options.turnProfiles ?? [
    createDefaultTurnProfileConfig({
      providerId: input.providers.defaultProviderId,
      modelId: input.providers.defaultModelId,
      allowedModelIds: input.providers.status.providers.find(
        (provider) => provider.providerId === input.providers.defaultProviderId,
      )?.modelIds ?? [input.providers.defaultModelId],
      allowedToolNames: input.tools.defaultEnabledToolNames,
      turnGuardIds: input.turnGuardIds,
    }),
  ];

  const registry = createTurnProfileRegistry({
    turnProfiles,
    defaultProfileId:
      options.defaultTurnProfileId ?? turnProfiles[0]?.profileId ?? DEFAULT_TURN_PROFILE_ID,
    promptBuilder,
    providers: input.providers.status.providers.map((provider) => ({
      providerId: provider.providerId,
      modelIds: provider.modelIds,
    })),
    toolNames: input.tools.toolCapabilities.map((capability) => capability.name),
    guardIds: input.registeredGuardIds,
  });

  return {
    registry,
    defaultTurnProfileId: registry.defaultProfileId,
    promptBuilder,
  };
};
