// Owns: validating assistant config against the provider/tool/guard registries
// and building assistant profiles plus their system prompts.
// Does not own: the manifest (built in createServiceCapabilityBundle), runtime
// execution, or turn-time tool exposure.

import { createAssistantProfileRegistry } from "#composition/assistant/assistant-profile-registry";
import {
  createDefaultAssistantConfig,
  DEFAULT_ASSISTANT_PROFILE_ID,
} from "#composition/assistant/default-assistant-config";
import { createDefaultSystemPromptBuilder } from "#composition/assistant/system-prompt-builder";
import type { ServiceProviderRegistry } from "#composition/providers/service-provider-registry";
import type { ServiceToolRegistry } from "#composition/tools/service-tool-registry";
import type { ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceAssistantBundle } from "./bundle-types.js";

export type ServiceAssistantBundleInput = {
  readonly providers: ServiceProviderRegistry;
  readonly tools: ServiceToolRegistry;
  /** Guard ids the built-in default assistant selects for its safety policy. */
  readonly turnGuardIds: readonly string[];
  /** Guard ids registered by the turn guard registry; the validation set. */
  readonly registeredGuardIds: readonly string[];
};

/**
 * Build assistant profiles before the manifest publishes them.
 *
 * Falls back to the built-in default assistant when no assistants are provided,
 * and validates every assistant against the provider, tool, and guard registries
 * before any route serves traffic. System prompts are built here, not inside the
 * manifest helper.
 */
export const createServiceAssistantBundle = (
  options: ServiceCompositionOptions,
  input: ServiceAssistantBundleInput,
): ServiceAssistantBundle => {
  const promptBuilder = createDefaultSystemPromptBuilder();
  const assistants = options.assistants ?? [
    createDefaultAssistantConfig({
      providerId: input.providers.defaultProviderId,
      modelId: input.providers.defaultModelId,
      allowedModelIds: input.providers.status.providers.find(
        (provider) => provider.providerId === input.providers.defaultProviderId,
      )?.modelIds ?? [input.providers.defaultModelId],
      allowedToolNames: input.tools.defaultEnabledToolNames,
      turnGuardIds: input.turnGuardIds,
    }),
  ];

  const registry = createAssistantProfileRegistry({
    assistants,
    defaultProfileId:
      options.defaultAssistantProfileId ?? assistants[0]?.profileId ?? DEFAULT_ASSISTANT_PROFILE_ID,
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
    defaultAssistantProfileId: registry.defaultProfileId,
    promptBuilder,
  };
};
