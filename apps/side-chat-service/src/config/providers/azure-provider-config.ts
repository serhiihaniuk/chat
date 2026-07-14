import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readArray,
  readObject,
  readRequiredPositiveInteger,
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "../settings/setting-readers.js";

import { PROVIDER_KINDS } from "./provider-config.js";

export const AZURE_PROVIDER = {
  KIND: PROVIDER_KINDS.AZURE,
  MODELS: {
    GPT_4O: { MODEL_ID: "gpt-4o", CONTEXT_WINDOW_TOKENS: 128_000 },
  },
  SECRET_ENV_KEYS: { API_KEY: "AZURE_OPENAI_API_KEY" },
  TRANSPORT_ENV_KEYS: {
    ENDPOINT: "AZURE_OPENAI_ENDPOINT",
    API_VERSION: "AZURE_OPENAI_API_VERSION",
    DEPLOYMENT: "AZURE_OPENAI_DEPLOYMENT",
  },
} as const;

type AzureAvailableModelConfig = Readonly<{
  id: ConfigValue<string>;
  contextWindowTokens: ConfigValue<number>;
  deployment: ConfigValue<string>;
}>;

export type AzureModelConfig = Readonly<{
  provider: typeof AZURE_PROVIDER.KIND;
  connection: Readonly<{
    apiKey: ConfigValue<string>;
    endpoint: ConfigValue<string>;
    apiVersion: ConfigValue<string>;
  }>;
  defaultModelId: ConfigValue<string>;
  availableModels: readonly AzureAvailableModelConfig[];
}>;

export type AzureAvailableModelSettings = Readonly<{
  id: string;
  contextWindowTokens: number;
  deployment: string;
}>;

export type AzureModelSettings = Readonly<{
  provider: typeof AZURE_PROVIDER.KIND;
  connection: Readonly<{
    apiKey: string;
    endpoint: string;
    apiVersion: string;
  }>;
  defaultModelId: string;
  availableModels: readonly AzureAvailableModelSettings[];
}>;

export function readAzureModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): AzureModelSettings {
  const connection = readObject(models["connection"], "models.connection", issues);
  return {
    provider: AZURE_PROVIDER.KIND,
    connection: {
      apiKey: readRequiredString(connection["apiKey"], "models.connection.apiKey", issues),
      endpoint: readRequiredString(connection["endpoint"], "models.connection.endpoint", issues),
      apiVersion: readRequiredString(
        connection["apiVersion"],
        "models.connection.apiVersion",
        issues,
      ),
    },
    defaultModelId: readRequiredString(models["defaultModelId"], "models.defaultModelId", issues),
    availableModels: readArray(models["availableModels"], "models.availableModels", issues).map(
      (candidate, index) => readAvailableModel(candidate, index, issues),
    ),
  };
}

function readAvailableModel(
  candidate: unknown,
  index: number,
  issues: SettingsIssue[],
): AzureAvailableModelSettings {
  const path = `models.availableModels.${index}`;
  const model = readObject(candidate, path, issues);
  return {
    id: readRequiredString(model["id"], `${path}.id`, issues),
    contextWindowTokens: readRequiredPositiveInteger(
      model["contextWindowTokens"],
      `${path}.contextWindowTokens`,
      issues,
    ),
    deployment: readRequiredString(model["deployment"], `${path}.deployment`, issues),
  };
}
