import {
  AUTH_PROFILES,
  AUTH_PROFILE_VALUES,
  type AuthProfile,
} from "../declaration/side-chat-config.js";
import {
  AZURE_PROVIDER,
  readAzureModelSettings,
  type AzureModelSettings,
} from "../providers/azure-provider-config.js";
import {
  OPENAI_PROVIDER,
  readOpenAIModelSettings,
  type OpenAIModelSettings,
} from "../providers/openai-provider-config.js";
import { PROVIDER_KINDS, PROVIDER_KIND_VALUES } from "../providers/provider-config.js";
import {
  readScriptedModelSettings,
  type ScriptedModelSettings,
} from "../providers/scripted-provider-config.js";

import {
  readObject,
  readRequiredCatalogValue,
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "./setting-readers.js";

export type ModelSettings = OpenAIModelSettings | AzureModelSettings | ScriptedModelSettings;

export type AuthSettings = Readonly<{
  profile: AuthProfile;
  bearerToken: string;
  workspaceId: string;
}>;

export function readDeploymentSettings(
  modelsCandidate: unknown,
  authCandidate: unknown,
  issues: SettingsIssue[],
): { models: ModelSettings; auth: AuthSettings } {
  const models = readObject(modelsCandidate, "models", issues);
  const auth = readObject(authCandidate, "auth", issues);
  return {
    models: readModelSettings(models, issues),
    auth: {
      profile: readRequiredCatalogValue(
        auth["profile"],
        "auth.profile",
        AUTH_PROFILE_VALUES,
        AUTH_PROFILES.DEVELOPMENT,
        issues,
      ),
      bearerToken: readRequiredString(auth["bearerToken"], "auth.bearerToken", issues),
      workspaceId: readRequiredString(auth["workspaceId"], "auth.workspaceId", issues),
    },
  };
}

function readModelSettings(models: SettingsObject, issues: SettingsIssue[]): ModelSettings {
  const provider = readRequiredCatalogValue(
    models["provider"],
    "models.provider",
    PROVIDER_KIND_VALUES,
    PROVIDER_KINDS.SCRIPTED,
    issues,
  );
  if (provider === AZURE_PROVIDER.KIND) {
    return readAzureModelSettings(models, issues);
  }
  if (provider === OPENAI_PROVIDER.KIND) {
    return readOpenAIModelSettings(models, issues);
  }
  return readScriptedModelSettings(models, issues);
}
