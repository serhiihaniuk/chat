import type { ModelProvider } from "#providers/model-provider";
import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";

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
      throw new AiRuntimeError(
        RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
        `duplicate provider ${provider.providerId}`,
      );
    }
    byId.set(provider.providerId, provider);
  }

  return { providers, byId };
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
  providerId: string,
  modelId: string,
): ModelProvider => {
  const provider = catalog.byId.get(providerId);
  if (!provider) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      `provider ${providerId} is not registered`,
    );
  }
  if (!provider.modelIds.includes(modelId)) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.MODEL_UNAVAILABLE,
      `model ${modelId} is not registered for provider ${providerId}`,
    );
  }
  return provider;
};
