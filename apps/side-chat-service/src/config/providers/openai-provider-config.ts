import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readArray,
  readObject,
  readOptionalCatalogValue,
  readOptionalString,
  readRequiredCatalogValue,
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
  SECRET_ENV_KEYS: { API_KEY: "OPENAI_API_KEY" },
  TRANSPORT_ENV_KEYS: { BASE_URL: "OPENAI_BASE_URL" },
} as const;

export const OPENAI_REASONING_EFFORT_VALUES = Object.values(OPENAI_PROVIDER.REASONING_EFFORTS);
export const OPENAI_REASONING_SUMMARY_VALUES = Object.values(OPENAI_PROVIDER.REASONING_SUMMARIES);

export type OpenAIReasoningEffort = (typeof OPENAI_REASONING_EFFORT_VALUES)[number];
export type OpenAIReasoningSummary = (typeof OPENAI_REASONING_SUMMARY_VALUES)[number];

type OpenAIAvailableModelConfig = Readonly<{
  id: ConfigValue<string>;
  contextWindowTokens: ConfigValue<number>;
  reasoning?:
    | Readonly<{
        defaultEffort: OpenAIReasoningEffort;
        efforts: readonly OpenAIReasoningEffort[];
      }>
    | undefined;
}>;

export type OpenAIModelConfig = Readonly<{
  provider: typeof OPENAI_PROVIDER.KIND;
  connection: Readonly<{
    apiKey: ConfigValue<string>;
    baseUrl?: ConfigValue<string | undefined>;
  }>;
  defaultModelId: ConfigValue<string>;
  availableModels: readonly OpenAIAvailableModelConfig[];
  reasoningSummary?: OpenAIReasoningSummary;
}>;

export type OpenAIAvailableModelSettings = Readonly<{
  id: string;
  contextWindowTokens: number;
  reasoning?:
    | Readonly<{
        defaultEffort: OpenAIReasoningEffort;
        efforts: readonly OpenAIReasoningEffort[];
      }>
    | undefined;
}>;

export type OpenAIModelSettings = Readonly<{
  provider: typeof OPENAI_PROVIDER.KIND;
  connection: Readonly<{ apiKey: string; baseUrl?: string | undefined }>;
  defaultModelId: string;
  availableModels: readonly OpenAIAvailableModelSettings[];
  reasoningSummary?: OpenAIReasoningSummary | undefined;
}>;

export function readOpenAIModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): OpenAIModelSettings {
  const connection = readObject(models["connection"], "models.connection", issues);
  const baseUrl = readOptionalString(connection["baseUrl"], "models.connection.baseUrl", issues);
  return {
    provider: OPENAI_PROVIDER.KIND,
    connection: {
      apiKey: readRequiredString(connection["apiKey"], "models.connection.apiKey", issues),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    },
    defaultModelId: readRequiredString(models["defaultModelId"], "models.defaultModelId", issues),
    availableModels: readArray(models["availableModels"], "models.availableModels", issues).map(
      (candidate, index) => readAvailableModel(candidate, index, issues),
    ),
    reasoningSummary: readOptionalCatalogValue(
      models["reasoningSummary"],
      "models.reasoningSummary",
      OPENAI_REASONING_SUMMARY_VALUES,
      issues,
    ),
  };
}

function readAvailableModel(
  candidate: unknown,
  index: number,
  issues: SettingsIssue[],
): OpenAIAvailableModelSettings {
  const path = `models.availableModels.${index}`;
  const model = readObject(candidate, path, issues);
  const reasoning = readReasoning(model["reasoning"], `${path}.reasoning`, issues);
  return {
    id: readRequiredString(model["id"], `${path}.id`, issues),
    contextWindowTokens: readRequiredPositiveInteger(
      model["contextWindowTokens"],
      `${path}.contextWindowTokens`,
      issues,
    ),
    ...(reasoning === undefined ? {} : { reasoning }),
  };
}

function readReasoning(
  candidate: unknown,
  path: string,
  issues: SettingsIssue[],
): OpenAIAvailableModelSettings["reasoning"] {
  if (candidate === undefined) return undefined;
  const reasoning = readObject(candidate, path, issues);
  return {
    defaultEffort: readRequiredCatalogValue(
      reasoning["defaultEffort"],
      `${path}.defaultEffort`,
      OPENAI_REASONING_EFFORT_VALUES,
      OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
      issues,
    ),
    efforts: readArray(reasoning["efforts"], `${path}.efforts`, issues).map((effort, index) =>
      readRequiredCatalogValue(
        effort,
        `${path}.efforts.${index}`,
        OPENAI_REASONING_EFFORT_VALUES,
        OPENAI_PROVIDER.REASONING_EFFORTS.MEDIUM,
        issues,
      ),
    ),
  };
}
