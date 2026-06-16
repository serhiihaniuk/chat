import {
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
} from "@side-chat/agent-runtime";
import type { TurnGuardRegistryPort } from "@side-chat/partner-ai-core";

import { createMockWebSearchRegistration } from "#adapters/tools/mock-web-search-tool";
import type {
  ServiceProviderRegistration,
  ServiceProviderRegistry,
} from "#composition/providers/service-provider-registry";
import type {
  ServiceToolRegistration,
  ServiceToolRegistry,
} from "#composition/tools/service-tool-registry";
import {
  createAssistantProfileRegistry,
  type AssistantProfileRegistry,
} from "#composition/assistant/assistant-profile-registry";
import {
  createDefaultAssistantConfig,
  DEFAULT_ASSISTANT_PROFILE_ID,
} from "#composition/assistant/default-assistant-config";
import { createDefaultSystemPromptBuilder } from "#composition/assistant/system-prompt-builder";
import type {
  RuntimeConfig,
  RuntimeToolConfig,
  ServiceCompositionOptions,
} from "./service-composition-types.js";

/**
 * Config-to-registration translators used by the service composition root.
 *
 * These functions turn operator-facing runtime/assistant config into the
 * validated registries composition wires together. They keep the composition
 * root focused on orchestration instead of per-surface translation rules.
 */

/**
 * Build the assistant profile registry from options and the other registries.
 *
 * Falls back to the built-in default assistant when no assistants are provided,
 * and validates every assistant against the provider, tool, and guard registries
 * before the manifest publishes the profiles.
 */
export const buildAssistantProfileRegistry = ({
  options,
  providerRegistry,
  toolRegistry,
  turnGuards,
}: {
  readonly options: ServiceCompositionOptions;
  readonly providerRegistry: ServiceProviderRegistry;
  readonly toolRegistry: ServiceToolRegistry;
  readonly turnGuards: TurnGuardRegistryPort;
}): AssistantProfileRegistry => {
  const assistants = options.assistants ?? [
    createDefaultAssistantConfig({
      providerId: providerRegistry.defaultProviderId,
      modelId: providerRegistry.defaultModelId,
      allowedToolNames: toolRegistry.defaultEnabledToolNames,
      turnGuardIds: options.turnGuardIds ?? [],
    }),
  ];

  return createAssistantProfileRegistry({
    assistants,
    defaultProfileId:
      options.defaultAssistantProfileId ?? assistants[0]?.profileId ?? DEFAULT_ASSISTANT_PROFILE_ID,
    promptBuilder: createDefaultSystemPromptBuilder(),
    providers: providerRegistry.status.providers.map((provider) => ({
      providerId: provider.providerId,
      modelIds: provider.modelIds,
    })),
    toolNames: toolRegistry.toolCapabilities.map((capability) => capability.name),
    guardIds: turnGuards.guards.map((guard) => guard.guardId),
  });
};

/**
 * Translate operator runtime config into one validated provider registration.
 *
 * Secrets and transport overrides stay on the registration; retention defaults
 * to the provider default until Phase 10 drives `no_retention` request
 * hardening, and reasoning defaults match the OpenAI provider adapter.
 */
export const providerRegistrationForConfig = (
  config: RuntimeConfig,
): ServiceProviderRegistration => {
  if (config.provider === "openai") {
    return {
      kind: "openai",
      providerId: OPENAI_PROVIDER_ID,
      modelIds: config.modelIds,
      defaultModelId: config.defaultModelId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl === "" ? undefined : config.baseUrl,
      fetch: config.fetch,
      retention: "provider_default",
      reasoning: {
        effort: config.reasoningEffort ?? "medium",
        summary: config.reasoningSummary ?? "auto",
      },
    };
  }

  const modelId = config.modelId ?? FAKE_ECHO_MODEL_ID;
  return {
    kind: "fake",
    providerId: FAKE_PROVIDER_ID,
    modelIds: [modelId],
    defaultModelId: modelId,
  };
};

/**
 * Collect tool registrations from config, including the local mock web search.
 *
 * The mock fixture joins the same registry path as app-owned tools, so enabling
 * it never adds a separate manifest or runtime wiring step.
 */
export const toolRegistrationsForConfig = (
  config: RuntimeConfig & RuntimeToolConfig,
): readonly ServiceToolRegistration[] => [
  ...(config.enableMockWebSearch ? [createMockWebSearchRegistration()] : []),
  ...(config.tools ?? []),
];
