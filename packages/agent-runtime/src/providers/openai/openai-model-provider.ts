import { Effect } from "effect";
import { createOpenAI } from "@ai-sdk/openai";
import { omitUndefinedProperties } from "@side-chat/shared";

import { AgentRuntimeError } from "#runtime/contract/runtime-error";
import { RUNTIME_ERROR_CODES } from "#runtime/contract/runtime-event";
import type { ModelProvider } from "#providers/model-provider";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export type OpenAIResponsesProviderOptions = {
  readonly apiKey: string;
  readonly modelIds: readonly string[];
  readonly baseUrl?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly reasoningEffort?: OpenAIReasoningEffort | undefined;
  readonly reasoningSummary?: OpenAIReasoningSummary | undefined;
};

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type OpenAIReasoningSummary = "auto" | "concise" | "detailed";

export const createOpenAIResponsesProvider = (
  options: OpenAIResponsesProviderOptions,
): ModelProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "OpenAI provider requires an API key.",
    );
  }
  if (options.modelIds.length === 0) {
    throw new AgentRuntimeError(
      RUNTIME_ERROR_CODES.MODEL_UNAVAILABLE,
      "OpenAI provider requires at least one allowed model id.",
    );
  }

  const openai = createOpenAI(
    omitUndefinedProperties({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: options.fetch,
    }),
  );

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
