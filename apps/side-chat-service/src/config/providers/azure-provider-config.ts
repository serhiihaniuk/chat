import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "../settings/setting-readers.js";

import { PROVIDER_KINDS } from "./provider-config.js";

export const AZURE_PROVIDER = {
  KIND: PROVIDER_KINDS.AZURE,
  MODELS: {
    GPT_4O: { MODEL_ID: "gpt-4o" },
  },
  SECRET_ENV_KEYS: {
    API_KEY: "AZURE_OPENAI_API_KEY",
  },
  TRANSPORT_ENV_KEYS: {
    ENDPOINT: "AZURE_OPENAI_ENDPOINT",
    API_VERSION: "AZURE_OPENAI_API_VERSION",
    DEPLOYMENT: "AZURE_OPENAI_DEPLOYMENT",
  },
  SETTINGS_FIELDS: {
    MODEL_ID: { KEY: "modelId", PATH: "models.modelId" },
    TITLE_MODEL_ID: { KEY: "titleModelId", PATH: "models.titleModelId" },
    DEPLOYMENT: { KEY: "deployment", PATH: "models.deployment" },
    API_KEY: { KEY: "apiKey", PATH: "models.apiKey" },
    ENDPOINT: { KEY: "endpoint", PATH: "models.endpoint" },
    API_VERSION: { KEY: "apiVersion", PATH: "models.apiVersion" },
  },
} as const;

export type AzureModelConfig = Readonly<{
  provider: typeof AZURE_PROVIDER.KIND;
  modelId: ConfigValue<string>;
  titleModelId: ConfigValue<string>;
  deployment: ConfigValue<string>;
  apiKey: ConfigValue<string>;
  endpoint: ConfigValue<string>;
  apiVersion: ConfigValue<string>;
}>;

export type AzureModelSettings = Readonly<{
  provider: typeof AZURE_PROVIDER.KIND;
  modelId: string;
  titleModelId: string;
  deployment: string;
  apiKey: string;
  endpoint: string;
  apiVersion: string;
}>;

export function readAzureModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): AzureModelSettings {
  const fields = AZURE_PROVIDER.SETTINGS_FIELDS;
  return {
    provider: AZURE_PROVIDER.KIND,
    modelId: readRequiredString(models[fields.MODEL_ID.KEY], fields.MODEL_ID.PATH, issues),
    titleModelId: readRequiredString(
      models[fields.TITLE_MODEL_ID.KEY],
      fields.TITLE_MODEL_ID.PATH,
      issues,
    ),
    deployment: readRequiredString(models[fields.DEPLOYMENT.KEY], fields.DEPLOYMENT.PATH, issues),
    apiKey: readRequiredString(models[fields.API_KEY.KEY], fields.API_KEY.PATH, issues),
    endpoint: readRequiredString(models[fields.ENDPOINT.KEY], fields.ENDPOINT.PATH, issues),
    apiVersion: readRequiredString(models[fields.API_VERSION.KEY], fields.API_VERSION.PATH, issues),
  };
}
