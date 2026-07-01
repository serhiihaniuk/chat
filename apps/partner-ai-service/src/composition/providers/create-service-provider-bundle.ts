// Owns: translating operator runtime config into one validated provider
// registration and building the provider registry/runtime providers.
// Does not own: the AgentRuntime (built in createServiceRuntimeBundle), turn
// profile model selection, or provider request hardening.

import {
  createServiceProviderRegistry,
  type ServiceProviderRegistration,
} from "#composition/providers/service-provider-registry";
import { DEFAULT_OPENAI_RETENTION_POLICY, PROVIDERS } from "#config/catalog/providers";
import type { RuntimeConfig, ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceProviderBundle } from "../bundle-types.js";

/**
 * Build the provider registry and runtime provider list from runtime config.
 *
 * The registry validates provider/model ids before turn profiles are
 * built, so a turn profile can never reference a provider or model the runtime
 * cannot serve. Secrets and transport overrides stay inside the registration.
 */
export const createServiceProviderBundle = (
  options: ServiceCompositionOptions,
): ServiceProviderBundle => {
  const runtimeConfig = options.runtime ?? { provider: PROVIDERS.FAKE.KIND };
  const registry = createServiceProviderRegistry([providerRegistrationForConfig(runtimeConfig)]);

  return {
    registry,
    runtimeProviders: registry.providers,
    defaultProviderId: registry.defaultProviderId,
    defaultModelId: registry.defaultModelId,
  };
};

/**
 * Translate operator runtime config into one validated provider registration.
 *
 * Secrets and transport overrides stay on the registration; retention is
 * `no_retention` so the OpenAI provider sends `store: false`, and the reasoning
 * summary is omitted unless the operator explicitly configures one.
 */
const providerRegistrationForConfig = (config: RuntimeConfig): ServiceProviderRegistration => {
  if (config.provider === PROVIDERS.OPENAI.KIND) {
    return {
      kind: PROVIDERS.OPENAI.KIND,
      providerId: PROVIDERS.OPENAI.PROVIDER_ID,
      modelIds: config.modelIds,
      defaultModelId: config.defaultModelId,
      modelMetadata: config.modelMetadata,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl === "" ? undefined : config.baseUrl,
      fetch: config.fetch,
      retention: DEFAULT_OPENAI_RETENTION_POLICY,
      reasoning: {
        effort:
          config.reasoningEffort ?? PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.DEFAULT_REASONING_EFFORT,
        allowedEfforts:
          config.reasoningEfforts ??
          PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI.SUPPORTED_REASONING_EFFORTS,
        summary: config.reasoningSummary,
      },
    };
  }

  if (config.provider === PROVIDERS.AZURE.KIND) {
    return {
      kind: PROVIDERS.AZURE.KIND,
      providerId: PROVIDERS.AZURE.PROVIDER_ID,
      modelIds: config.modelIds,
      defaultModelId: config.defaultModelId,
      modelMetadata: config.modelMetadata,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      apiVersion: config.apiVersion,
      deploymentsByModelId: config.deploymentsByModelId,
      fetch: config.fetch,
      reasoning: {
        effort: config.reasoningEffort ?? PROVIDERS.AZURE.MODELS.GPT_4O.DEFAULT_REASONING_EFFORT,
        allowedEfforts:
          config.reasoningEfforts ?? PROVIDERS.AZURE.MODELS.GPT_4O.SUPPORTED_REASONING_EFFORTS,
      },
    };
  }

  const modelId = config.modelId ?? PROVIDERS.FAKE.MODELS.FAKE_ECHO.MODEL_ID;
  return {
    kind: PROVIDERS.FAKE.KIND,
    providerId: PROVIDERS.FAKE.PROVIDER_ID,
    modelIds: [modelId],
    defaultModelId: modelId,
    modelMetadata: config.modelMetadata,
    reasoning: {
      effort: PROVIDERS.FAKE.MODELS.FAKE_ECHO.DEFAULT_REASONING_EFFORT,
      allowedEfforts: PROVIDERS.FAKE.MODELS.FAKE_ECHO.SUPPORTED_REASONING_EFFORTS,
    },
  };
};
