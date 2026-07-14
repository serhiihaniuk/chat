import { createAzure } from "@ai-sdk/azure";
import type { LanguageModelV4 } from "@ai-sdk/provider";

export type AzureModelProviderOptions = {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly apiVersion: string;
  readonly models: readonly Readonly<{ id: string; deployment: string }>[];
  readonly fetch?: typeof fetch | undefined;
};

/** Raw Azure construction stays inside the provider adapter. */
export type AzureModelAdapter = Readonly<{
  readonly modelFor: (modelId: string) => LanguageModelV4;
}>;

/** Keep Azure deployment routing private to its adapter. */
export function createAzureModelAdapter(options: AzureModelProviderOptions): AzureModelAdapter {
  const azure = createAzureClient(options);
  return {
    modelFor: (modelId) => {
      const model = configuredModel(options, modelId);
      return azure.chat(model.deployment);
    },
  };
}

function configuredModel(
  options: AzureModelProviderOptions,
  modelId: string,
): Readonly<{ id: string; deployment: string }> {
  const model = options.models.find((candidate) => candidate.id === modelId);
  if (model === undefined) throw new Error(`Azure model is not configured: ${modelId}`);
  return model;
}

function createAzureClient(options: AzureModelProviderOptions) {
  const baseOptions = {
    apiKey: options.apiKey,
    apiVersion: options.apiVersion,
    baseURL: normalizeAzureEndpoint(options.endpoint),
    useDeploymentBasedUrls: true,
  };
  if (options.fetch === undefined) return createAzure(baseOptions);
  return createAzure({
    apiKey: baseOptions.apiKey,
    apiVersion: baseOptions.apiVersion,
    baseURL: baseOptions.baseURL,
    useDeploymentBasedUrls: baseOptions.useDeploymentBasedUrls,
    fetch: options.fetch,
  });
}

function normalizeAzureEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/u, "");
  return trimmed.endsWith("/openai") ? trimmed : `${trimmed}/openai`;
}
