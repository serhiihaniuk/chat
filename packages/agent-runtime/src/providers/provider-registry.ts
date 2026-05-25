import { Effect } from "effect";

import { AgentRuntimeError } from "#runtime/runtime-error";
import type { ModelProvider, ProviderSelection } from "./model-provider.js";

export type ProviderRegistry = {
  readonly providers: readonly ModelProvider[];
  resolve(selection: ProviderSelection): Effect.Effect<ModelProvider, AgentRuntimeError>;
};

export const createProviderRegistry = (providers: readonly ModelProvider[]): ProviderRegistry => {
  const byId = new Map<string, ModelProvider>();
  for (const provider of providers) {
    if (byId.has(provider.providerId)) {
      throw new AgentRuntimeError(
        "provider_unavailable",
        `duplicate provider ${provider.providerId}`,
      );
    }
    byId.set(provider.providerId, provider);
  }

  return {
    providers,
    resolve(selection) {
      return Effect.try({
        try: () => {
          const provider = byId.get(selection.providerId);
          if (!provider) {
            throw new AgentRuntimeError(
              "provider_unavailable",
              `provider ${selection.providerId} is not registered`,
            );
          }
          if (!provider.modelIds.includes(selection.modelId)) {
            throw new AgentRuntimeError(
              "model_unavailable",
              `model ${selection.modelId} is not registered for provider ${selection.providerId}`,
            );
          }
          return provider;
        },
        catch: (error) =>
          error instanceof AgentRuntimeError
            ? error
            : new AgentRuntimeError("provider_unavailable", "provider registry failed"),
      });
    },
  };
};
