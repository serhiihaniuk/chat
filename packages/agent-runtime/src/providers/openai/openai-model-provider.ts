import { Effect } from "effect";
import { createOpenAI } from "@ai-sdk/openai";

import { AgentRuntimeError } from "#runtime/contract/runtime-error";
import type { ModelProvider } from "#providers/model-provider";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAIResponsesProviderOptions = {
  readonly apiKey: string;
  readonly modelIds: readonly string[];
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly reasoningEffort?: OpenAIReasoningEffort;
  readonly reasoningSummary?: OpenAIReasoningSummary;
};

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningSummary = "auto" | "concise" | "detailed";

export const createOpenAIResponsesProvider = (
  options: OpenAIResponsesProviderOptions,
): ModelProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new AgentRuntimeError("provider_unavailable", "OpenAI provider requires an API key.");
  }
  if (options.modelIds.length === 0) {
    throw new AgentRuntimeError(
      "model_unavailable",
      "OpenAI provider requires at least one allowed model id.",
    );
  }

  const openai = createOpenAI({
    apiKey: options.apiKey,
    ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });

  return {
    providerId: OPENAI_PROVIDER_ID,
    modelIds: options.modelIds,
    resolveModel: (selection) => Effect.succeed(openai.responses(selection.modelId)),
    resolveProviderOptions: () =>
      Effect.succeed({
        openai: {
          reasoningEffort: options.reasoningEffort ?? "medium",
          reasoningSummary: options.reasoningSummary ?? "auto",
        },
      }),
  };
};
