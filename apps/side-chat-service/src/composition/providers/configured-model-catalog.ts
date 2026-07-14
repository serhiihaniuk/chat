import type { SideChatReasoningSupport } from "@side-chat/stream-profile";

import type {
  ConfiguredTurnModel,
  ConfiguredTurnModelCatalog,
} from "#application/turn/turn-model-policy";
import { OPENAI_PROVIDER } from "#config/providers/openai-provider-config";
import type { Settings } from "#config/settings/resolve-settings";

export type PublishedModel = ConfiguredTurnModel &
  Readonly<{
    provider: string;
    contextWindowTokens: number;
  }>;

export type PublishedModelCatalog = Readonly<{
  models: readonly PublishedModel[];
  defaultModelId: string;
}>;

/** Project the resolved deployment catalog into application and public shapes. */
export function configuredModelCatalog(settings: Settings): ConfiguredTurnModelCatalog {
  return {
    defaultModelId: settings.models.defaultModelId,
    availableModels: settings.models.availableModels.map((model) => ({
      id: model.id,
      ...reasoningFor(settings, model.id),
    })),
  };
}

export function publishedModelCatalog(settings: Settings): PublishedModelCatalog {
  return {
    defaultModelId: settings.models.defaultModelId,
    models: settings.models.availableModels.map((model) => ({
      id: model.id,
      provider: settings.models.provider,
      contextWindowTokens: model.contextWindowTokens,
      ...reasoningFor(settings, model.id),
    })),
  };
}

function reasoningFor(
  settings: Settings,
  modelId: string,
): Readonly<{ reasoning?: SideChatReasoningSupport }> {
  if (settings.models.provider !== OPENAI_PROVIDER.KIND) return {};
  const model = settings.models.availableModels.find((candidate) => candidate.id === modelId);
  return model?.reasoning === undefined ? {} : { reasoning: model.reasoning };
}
