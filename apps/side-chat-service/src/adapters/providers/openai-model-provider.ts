import {
  createOpenAI,
  type OpenAIProvider,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";

import type { ModelProvider } from "#application/ports/model-provider";

export type OpenAIModelProviderOptions = {
  readonly apiKey: string;
  readonly modelId: string;
  readonly titleModelId: string;
  readonly baseUrl?: string | undefined;
  readonly reasoningEffort?:
    | NonNullable<OpenAIResponsesProviderOptions["reasoningEffort"]>
    | undefined;
  readonly reasoningSummary?:
    | NonNullable<OpenAIResponsesProviderOptions["reasoningSummary"]>
    | undefined;
  readonly fetch?: typeof fetch | undefined;
};

/** Bind OpenAI retention and reasoning policy once, outside durable workflow code. */
export function createOpenAIModelProvider(options: OpenAIModelProviderOptions): ModelProvider {
  const openai = createOpenAIClient(options);
  return {
    modelFor: ({ modelId }) => {
      if (modelId !== options.modelId && modelId !== options.titleModelId)
        throw new Error(`OpenAI model is not configured: ${modelId}`);
      if (options.reasoningEffort === undefined) {
        return {
          model: openai.responses(modelId),
          providerOptions: {
            openai: {
              store: false,
              reasoningSummary: options.reasoningSummary ?? null,
            },
          },
        };
      }
      return {
        model: openai.responses(modelId),
        providerOptions: {
          openai: {
            store: false,
            reasoningEffort: options.reasoningEffort,
            reasoningSummary: options.reasoningSummary ?? null,
          },
        },
      };
    },
  };
}

function createOpenAIClient(options: OpenAIModelProviderOptions): OpenAIProvider {
  if (options.baseUrl !== undefined && options.fetch !== undefined) {
    return createOpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: options.fetch,
    });
  }
  if (options.baseUrl !== undefined) {
    return createOpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });
  }
  if (options.fetch !== undefined) {
    return createOpenAI({ apiKey: options.apiKey, fetch: options.fetch });
  }
  return createOpenAI({ apiKey: options.apiKey });
}
