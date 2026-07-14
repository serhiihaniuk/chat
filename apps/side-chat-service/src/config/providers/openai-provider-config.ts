import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readOptionalCatalogValue,
  readOptionalString,
  readRequiredPositiveInteger,
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "../settings/setting-readers.js";

import { PROVIDER_KINDS } from "./provider-config.js";

const OPENAI_REASONING_EFFORTS = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;

export const OPENAI_PROVIDER = {
  KIND: PROVIDER_KINDS.OPENAI,
  MODELS: {
    GPT_5_6_LUNA: {
      MODEL_ID: "gpt-5.6-luna",
      CONTEXT_WINDOW_TOKENS: 372_000,
      DEFAULT_REASONING_EFFORT: OPENAI_REASONING_EFFORTS.MEDIUM,
      SUPPORTED_REASONING_EFFORTS: [
        OPENAI_REASONING_EFFORTS.LOW,
        OPENAI_REASONING_EFFORTS.MEDIUM,
        OPENAI_REASONING_EFFORTS.HIGH,
      ],
    },
  },
  REASONING_EFFORTS: OPENAI_REASONING_EFFORTS,
  REASONING_SUMMARIES: {
    AUTO: "auto",
    CONCISE: "concise",
    DETAILED: "detailed",
  },
  SECRET_ENV_KEYS: {
    API_KEY: "OPENAI_API_KEY",
  },
  TRANSPORT_ENV_KEYS: {
    BASE_URL: "OPENAI_BASE_URL",
  },
  SETTINGS_FIELDS: {
    MODEL_ID: { KEY: "modelId", PATH: "models.modelId" },
    TITLE_MODEL_ID: { KEY: "titleModelId", PATH: "models.titleModelId" },
    CONTEXT_WINDOW_TOKENS: {
      KEY: "contextWindowTokens",
      PATH: "models.contextWindowTokens",
    },
    API_KEY: { KEY: "apiKey", PATH: "models.apiKey" },
    BASE_URL: { KEY: "baseUrl", PATH: "models.baseUrl" },
    REASONING_EFFORT: {
      KEY: "reasoningEffort",
      PATH: "models.reasoningEffort",
    },
    REASONING_SUMMARY: {
      KEY: "reasoningSummary",
      PATH: "models.reasoningSummary",
    },
  },
} as const;

export const OPENAI_REASONING_EFFORT_VALUES = Object.values(OPENAI_PROVIDER.REASONING_EFFORTS);
export const OPENAI_REASONING_SUMMARY_VALUES = Object.values(OPENAI_PROVIDER.REASONING_SUMMARIES);

export type OpenAIReasoningEffort = (typeof OPENAI_REASONING_EFFORT_VALUES)[number];
export type OpenAIReasoningSummary = (typeof OPENAI_REASONING_SUMMARY_VALUES)[number];

export type OpenAIModelConfig = Readonly<{
  provider: typeof OPENAI_PROVIDER.KIND;
  modelId: ConfigValue<string>;
  titleModelId: ConfigValue<string>;
  contextWindowTokens: ConfigValue<number>;
  apiKey: ConfigValue<string>;
  baseUrl?: ConfigValue<string | undefined>;
  reasoningEffort?: OpenAIReasoningEffort;
  reasoningSummary?: OpenAIReasoningSummary;
}>;

export type OpenAIModelSettings = Readonly<{
  provider: typeof OPENAI_PROVIDER.KIND;
  modelId: string;
  titleModelId: string;
  contextWindowTokens: number;
  apiKey: string;
  baseUrl?: string | undefined;
  reasoningEffort?: OpenAIReasoningEffort | undefined;
  reasoningSummary?: OpenAIReasoningSummary | undefined;
}>;

/** Resolve the exact reasoning policy owned by an enabled OpenAI model descriptor. */
export function openAIReasoningSupport(
  modelId: string,
  configuredDefault?: OpenAIReasoningEffort,
): OpenAIReasoningSupport | undefined {
  const model = Object.values(OPENAI_PROVIDER.MODELS).find(
    (candidate) => candidate.MODEL_ID === modelId,
  );
  if (model === undefined) return undefined;
  const efforts = model.SUPPORTED_REASONING_EFFORTS;
  const defaultEffort = configuredDefault ?? model.DEFAULT_REASONING_EFFORT;
  if (!efforts.some((effort) => effort === defaultEffort)) return undefined;
  return { efforts, defaultEffort };
}

type OpenAIReasoningSupport = Readonly<{
  efforts: readonly OpenAIReasoningEffort[];
  defaultEffort: OpenAIReasoningEffort;
}>;

export function readOpenAIModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): OpenAIModelSettings {
  const fields = OPENAI_PROVIDER.SETTINGS_FIELDS;
  return {
    provider: OPENAI_PROVIDER.KIND,
    modelId: readRequiredString(models[fields.MODEL_ID.KEY], fields.MODEL_ID.PATH, issues),
    titleModelId: readRequiredString(
      models[fields.TITLE_MODEL_ID.KEY],
      fields.TITLE_MODEL_ID.PATH,
      issues,
    ),
    contextWindowTokens: readRequiredPositiveInteger(
      models[fields.CONTEXT_WINDOW_TOKENS.KEY],
      fields.CONTEXT_WINDOW_TOKENS.PATH,
      issues,
    ),
    apiKey: readRequiredString(models[fields.API_KEY.KEY], fields.API_KEY.PATH, issues),
    baseUrl: readOptionalString(models[fields.BASE_URL.KEY], fields.BASE_URL.PATH, issues),
    reasoningEffort: readOptionalCatalogValue(
      models[fields.REASONING_EFFORT.KEY],
      fields.REASONING_EFFORT.PATH,
      OPENAI_REASONING_EFFORT_VALUES,
      issues,
    ),
    reasoningSummary: readOptionalCatalogValue(
      models[fields.REASONING_SUMMARY.KEY],
      fields.REASONING_SUMMARY.PATH,
      OPENAI_REASONING_SUMMARY_VALUES,
      issues,
    ),
  };
}
