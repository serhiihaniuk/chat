import {
  createOpenAI,
  type OpenAIProvider,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { SideChatReasoningEffort } from "@side-chat/stream-profile";

import type { ProviderOptions } from "#application/ports/model-provider";

export type OpenAIModelProviderOptions = {
  readonly apiKey: string;
  readonly modelId: string;
  readonly titleModelId: string;
  readonly baseUrl?: string | undefined;
  readonly reasoningEffort?: SideChatReasoningEffort | undefined;
  readonly reasoningSummary?:
    | NonNullable<OpenAIResponsesProviderOptions["reasoningSummary"]>
    | undefined;
  readonly fetch?: typeof fetch | undefined;
};

/** Raw OpenAI construction stays inside the provider adapter. */
export type OpenAIModelAdapter = Readonly<{
  readonly modelFor: (modelId: string) => LanguageModelV4;
  readonly providerOptions: ProviderOptions;
  readonly providerOptionsFor: (effort?: SideChatReasoningEffort) => ProviderOptions;
}>;

/** Bind OpenAI retention and reasoning policy outside durable workflow code. */
export function createOpenAIModelAdapter(options: OpenAIModelProviderOptions): OpenAIModelAdapter {
  const openai = createOpenAIClient(options);
  return {
    modelFor: (modelId) => {
      assertConfiguredModel(options, modelId);
      return openai.responses(modelId);
    },
    providerOptions: createProviderOptions(options),
    providerOptionsFor: (effort) => createProviderOptions(options, effort),
  };
}

function assertConfiguredModel(options: OpenAIModelProviderOptions, modelId: string): void {
  if (modelId !== options.modelId && modelId !== options.titleModelId) {
    throw new Error(`OpenAI model is not configured: ${modelId}`);
  }
}

function createProviderOptions(
  options: OpenAIModelProviderOptions,
  effort: SideChatReasoningEffort | undefined = options.reasoningEffort,
): ProviderOptions {
  const openaiOptions = {
    store: false,
    reasoningSummary: options.reasoningSummary ?? null,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
  return { openai: openaiOptions };
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
