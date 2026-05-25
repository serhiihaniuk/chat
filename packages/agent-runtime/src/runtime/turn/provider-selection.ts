import type { ModelProvider, ProviderSelection } from "#providers/model-provider";
import { AgentRuntimeError } from "../contract/runtime-error.js";
import { RUNTIME_ERROR_CODES } from "../contract/runtime-event.js";
import type { AgentRuntimeRequest } from "../contract/runtime-request.js";
import type { AssistantProfile } from "./assistant-profile.js";

/**
 * ProviderCatalog records which model backends were injected at startup.
 *
 * During request handling the runtime first chooses provider/model ids, then
 * checks this catalog. That prevents silently switching to a different model
 * when the requested one is unavailable.
 */
export type ProviderCatalog = {
  readonly providers: readonly ModelProvider[];
  readonly byId: ReadonlyMap<string, ModelProvider>;
};

export const createProviderCatalog = (providers: readonly ModelProvider[]): ProviderCatalog => {
  const byId = new Map<string, ModelProvider>();
  for (const provider of providers) {
    if (byId.has(provider.providerId)) {
      throw new AgentRuntimeError(
        RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
        `duplicate provider ${provider.providerId}`,
      );
    }
    byId.set(provider.providerId, provider);
  }

  return { providers, byId };
};

/**
 * Choose provider/model ids before any provider adapter is called.
 *
 * The priority is concrete and intentionally small:
 * request values, then profile values, then the only registered provider/model
 * for simple local setups. Missing or unknown ids fail the turn instead of
 * guessing another model.
 */
export const resolveProviderSelection = (
  request: AgentRuntimeRequest,
  profile: AssistantProfile,
  providers: readonly ModelProvider[],
): ProviderSelection => {
  const providerId = request.providerId ?? profile.defaultProviderId ?? onlyProviderId(providers);
  const provider = providers.find((entry) => entry.providerId === providerId);
  const modelId = request.modelId ?? profile.defaultModelId ?? provider?.modelIds[0];

  if (!providerId)
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "No provider selected for runtime turn.",
    );
  if (!modelId)
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.MODEL_UNAVAILABLE,
      "No model selected for runtime turn.",
    );

  return { providerId, modelId };
};

/**
 * Convert the selected provider/model ids into the provider object to call.
 *
 * The runtime calls `resolveModel` only after this check, so provider adapters
 * can stay focused on creating AI SDK model handles rather than deciding
 * product-level model switching rules.
 */
export const resolveProvider = (
  catalog: ProviderCatalog,
  selection: ProviderSelection,
): ModelProvider => {
  const provider = catalog.byId.get(selection.providerId);
  if (!provider) {
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      `provider ${selection.providerId} is not registered`,
    );
  }
  if (!provider.modelIds.includes(selection.modelId)) {
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.MODEL_UNAVAILABLE,
      `model ${selection.modelId} is not registered for provider ${selection.providerId}`,
    );
  }
  return provider;
};

const onlyProviderId = (providers: readonly ModelProvider[]): string | undefined =>
  providers.length === 1 ? providers[0]?.providerId : undefined;
