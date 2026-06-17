// Owns: translating operator runtime config into one validated provider
// registration and building the provider registry/runtime providers.
// Does not own: the AgentRuntime (built in createServiceRuntimeBundle), assistant
// model selection, or provider request hardening (Phase 10).

import {
  FAKE_ECHO_MODEL_ID,
  FAKE_PROVIDER_ID,
  OPENAI_PROVIDER_ID,
  OPENAI_REASONING_EFFORTS,
} from "@side-chat/agent-runtime";

import {
  createServiceProviderRegistry,
  SERVICE_MODEL_RETENTION_POLICIES,
  type ServiceProviderRegistration,
} from "#composition/providers/service-provider-registry";
import type { RuntimeConfig, ServiceCompositionOptions } from "../service-composition-types.js";
import type { ServiceProviderBundle } from "./bundle-types.js";

/**
 * Build the provider registry and runtime provider list from runtime config.
 *
 * The registry validates provider/model ids before assistant profiles are
 * built, so an assistant can never reference a provider or model the runtime
 * cannot serve. Secrets and transport overrides stay inside the registration.
 */
export const createServiceProviderBundle = (
  options: ServiceCompositionOptions,
): ServiceProviderBundle => {
  const runtimeConfig = options.runtime ?? { provider: "fake" };
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
  if (config.provider === "openai") {
    return {
      kind: "openai",
      providerId: OPENAI_PROVIDER_ID,
      modelIds: config.modelIds,
      defaultModelId: config.defaultModelId,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl === "" ? undefined : config.baseUrl,
      fetch: config.fetch,
      retention: SERVICE_MODEL_RETENTION_POLICIES.NO_RETENTION,
      reasoning: {
        effort: config.reasoningEffort ?? OPENAI_REASONING_EFFORTS.MEDIUM,
        summary: config.reasoningSummary,
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
