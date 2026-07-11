import { createAzure } from "@ai-sdk/azure";

import type { ModelProvider } from "#application/ports/model-provider";

export type AzureModelProviderOptions = {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly apiVersion: string;
  readonly modelId: string;
  readonly deployment: string;
  readonly fetch?: typeof fetch | undefined;
};

/** Keep Azure's deployment routing private to its adapter. */
export function createAzureModelProvider(options: AzureModelProviderOptions): ModelProvider {
  const azure = createAzure({
    apiKey: options.apiKey,
    apiVersion: options.apiVersion,
    baseURL: normalizeAzureEndpoint(options.endpoint),
    useDeploymentBasedUrls: true,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return {
    modelFor: ({ modelId }) => {
      if (modelId !== options.modelId) throw new Error(`Azure model is not configured: ${modelId}`);
      return { model: azure.chat(options.deployment) };
    },
  };
}

function normalizeAzureEndpoint(endpoint: string): string {
  const trimmed = endpoint.replace(/\/+$/u, "");
  return trimmed.endsWith("/openai") ? trimmed : `${trimmed}/openai`;
}
