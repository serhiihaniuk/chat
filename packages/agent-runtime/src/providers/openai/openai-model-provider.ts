import { Effect } from "effect";
import { createOpenAI } from "@ai-sdk/openai";
import { omitUndefinedProperties } from "@side-chat/shared";
import { AiRuntimeError, RUNTIME_ERROR_CODES } from "@side-chat/ai-runtime-contract";

import type { ModelProvider } from "#providers/model-provider";

export const OPENAI_PROVIDER_ID = "openai" as const;
export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * Service-owned inputs for building the OpenAI Responses provider.
 *
 * `apiKey`, `baseUrl`, and `fetch` are agent-runtime-private transport inputs:
 * they configure how this package reaches OpenAI and must never reach the
 * manifest, diagnostics, or the browser. `modelIds` and the reasoning fields are
 * the model-visible policy that callers and downstream surfaces are allowed to
 * see.
 */
export type OpenAIResponsesProviderOptions = {
  readonly apiKey: string;
  readonly modelIds: readonly string[];
  readonly baseUrl?: string | undefined;
  readonly fetch?: typeof fetch | undefined;
  readonly reasoningEffort?: OpenAIReasoningEffort | undefined;
  readonly reasoningSummary?: OpenAIReasoningSummary | undefined;
};

export const OPENAI_REASONING_EFFORTS = {
  NONE: "none",
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

export type OpenAIReasoningEffort =
  (typeof OPENAI_REASONING_EFFORTS)[keyof typeof OPENAI_REASONING_EFFORTS];

export const OPENAI_REASONING_SUMMARIES = {
  AUTO: "auto",
  CONCISE: "concise",
  DETAILED: "detailed",
} as const;

export type OpenAIReasoningSummary =
  (typeof OPENAI_REASONING_SUMMARIES)[keyof typeof OPENAI_REASONING_SUMMARIES];

/**
 * Map these provider options onto an AI SDK `createOpenAI` Responses ModelProvider.
 *
 * At this boundary `baseUrl` becomes the AI SDK `baseURL`, and the secret
 * `apiKey` stays hidden inside `createOpenAI` so it never travels with the
 * returned provider. Every request sends `store: false` so OpenAI does not retain
 * the prompt or response. `reasoningEffort` defaults to MEDIUM; `reasoningSummary`
 * is omitted unless the caller explicitly opts in, so no reasoning summary is
 * requested by default.
 */
export const createOpenAIResponsesProvider = (
  options: OpenAIResponsesProviderOptions,
): ModelProvider => {
  if (options.apiKey.trim().length === 0) {
    throw new AiRuntimeError(
      RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      "OpenAI provider requires an API key.",
    );
  }
  if (options.modelIds.length === 0) {
    throw new AiRuntimeError(
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
        // `store: false` disables OpenAI-side retention of prompts/responses.
        // `reasoningSummary` is only sent when explicitly configured, so the
        // default request never asks OpenAI to produce a reasoning summary.
        openai: omitUndefinedProperties({
          store: false,
          reasoningEffort: options.reasoningEffort ?? OPENAI_REASONING_EFFORTS.MEDIUM,
          reasoningSummary: options.reasoningSummary,
        }),
      }),
  };
};
