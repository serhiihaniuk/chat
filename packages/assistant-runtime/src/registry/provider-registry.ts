import { AssistantRuntimeError } from "../errors.js";
import type { AssistantProvider } from "../provider.js";

export type ProviderSelection = {
  readonly providerId: string;
  readonly modelId: string;
};

export type ProviderRegistry = {
  readonly providers: readonly AssistantProvider[];
  resolve(selection: ProviderSelection): AssistantProvider;
};

export const createProviderRegistry = (
  providers: readonly AssistantProvider[],
): ProviderRegistry => {
  const byId = new Map<string, AssistantProvider>();
  for (const provider of providers) {
    if (byId.has(provider.providerId)) {
      throw new AssistantRuntimeError(
        "provider_unavailable",
        `duplicate provider ${provider.providerId}`,
      );
    }
    byId.set(provider.providerId, provider);
  }

  return {
    providers,
    resolve(selection) {
      const provider = byId.get(selection.providerId);
      if (!provider) {
        throw new AssistantRuntimeError(
          "provider_unavailable",
          `provider ${selection.providerId} is not registered`,
        );
      }
      if (!provider.modelIds.includes(selection.modelId)) {
        throw new AssistantRuntimeError(
          "model_unavailable",
          `model ${selection.modelId} is not registered for provider ${selection.providerId}`,
        );
      }
      return provider;
    },
  };
};
