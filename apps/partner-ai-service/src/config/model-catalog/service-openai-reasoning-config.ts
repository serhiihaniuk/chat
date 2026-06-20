import { type OpenAIReasoningEffort, type OpenAIReasoningSummary } from "@side-chat/agent-runtime";

import { PROVIDERS } from "#config/catalog/providers";
import { ServiceConfigError } from "../service-config-error.js";

const defaultOpenAIModel = PROVIDERS.OPENAI.MODELS.GPT_5_4_MINI;

const openaiReasoningEfforts = new Set<string>(defaultOpenAIModel.SUPPORTED_REASONING_EFFORTS);

const openaiReasoningSummaries = new Set<string>(
  Object.values(PROVIDERS.OPENAI.REASONING_SUMMARIES),
);

export const readOpenAIReasoningEffort = (rawEffort: string | undefined): OpenAIReasoningEffort => {
  if (!rawEffort) return defaultOpenAIModel.DEFAULT_REASONING_EFFORT;
  if (openaiReasoningEfforts.has(rawEffort)) {
    return rawEffort as OpenAIReasoningEffort;
  }
  throw new ServiceConfigError(
    "SIDECHAT_OPENAI_REASONING_EFFORT must be none, minimal, low, medium, high, or xhigh.",
  );
};

export const readOpenAIReasoningEfforts = (
  rawEfforts: string | undefined,
  defaultEffort: OpenAIReasoningEffort,
): readonly OpenAIReasoningEffort[] => {
  const efforts = rawEfforts
    ? uniqueValues(
        rawEfforts
          .split(",")
          .map((effort) => effort.trim())
          .filter(Boolean)
          .map(readOpenAIReasoningEffort),
      )
    : defaultOpenAIModel.SUPPORTED_REASONING_EFFORTS;

  if (efforts.length === 0) {
    throw new ServiceConfigError("SIDECHAT_OPENAI_REASONING_EFFORTS must not be empty.");
  }
  if (efforts.includes(defaultEffort)) return efforts;

  throw new ServiceConfigError(
    "SIDECHAT_OPENAI_REASONING_EFFORT must be included in SIDECHAT_OPENAI_REASONING_EFFORTS.",
  );
};

export const readOpenAIReasoningSummary = (
  rawSummary: string | undefined,
): OpenAIReasoningSummary | undefined => {
  // Reasoning summaries are hidden by default: an unset env omits the summary so
  // the provider never requests one unless the operator opts in.
  if (!rawSummary) return undefined;
  if (openaiReasoningSummaries.has(rawSummary)) {
    return rawSummary as OpenAIReasoningSummary;
  }
  throw new ServiceConfigError(
    "SIDECHAT_OPENAI_REASONING_SUMMARY must be auto, concise, or detailed.",
  );
};

const uniqueValues = <Value>(values: readonly Value[]): readonly Value[] => [...new Set(values)];
