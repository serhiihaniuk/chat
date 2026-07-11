import { createAzureModelProvider } from "#adapters/providers/azure-model-provider";
import { createOpenAIModelProvider } from "#adapters/providers/openai-model-provider";
import type { ModelProvider } from "#application/ports/model-provider";
import type { Settings } from "#config/settings/resolve-settings";
import { AZURE_PROVIDER } from "#config/providers/azure-provider-config";
import { OPENAI_PROVIDER } from "#config/providers/openai-provider-config";

/** Production composition is fail-closed: scripted models never resolve here. */
export function createProductionModelProvider(settings: Settings): ModelProvider {
  if (settings.models.provider === OPENAI_PROVIDER.KIND)
    return createOpenAIModelProvider(settings.models);
  if (settings.models.provider === AZURE_PROVIDER.KIND)
    return createAzureModelProvider(settings.models);
  throw new Error("Scripted models are available only in testing composition");
}
