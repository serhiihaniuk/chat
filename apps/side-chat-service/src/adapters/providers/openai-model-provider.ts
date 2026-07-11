import { createOpenAI } from "@ai-sdk/openai";

import type { ModelProvider } from "#application/ports/model-provider";

export type OpenAIModelProviderOptions = {
  readonly apiKey: string;
  readonly modelId: string;
  readonly baseUrl?: string | undefined;
  readonly reasoningEffort?: "low" | "medium" | "high" | undefined;
  readonly reasoningSummary?: "auto" | "concise" | "detailed" | undefined;
  readonly fetch?: typeof fetch | undefined;
};

/** Bind OpenAI retention and reasoning policy once, outside durable workflow code. */
export function createOpenAIModelProvider(options: OpenAIModelProviderOptions): ModelProvider {
  const openai = createOpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl === undefined ? {} : { baseURL: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return {
    modelFor: ({ modelId }) => {
      if (modelId !== options.modelId)
        throw new Error(`OpenAI model is not configured: ${modelId}`);
      return {
        model: openai.responses(modelId),
        providerOptions: {
          openai: {
            store: false,
            ...(options.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: options.reasoningEffort }),
            reasoningSummary: options.reasoningSummary ?? null,
          },
        },
      };
    },
  };
}
