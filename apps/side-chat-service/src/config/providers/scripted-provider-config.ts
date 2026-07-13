import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readRequiredPositiveInteger,
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "../settings/setting-readers.js";

import { PROVIDER_KINDS } from "./provider-config.js";

export const SCRIPTED_PROVIDER = {
  KIND: PROVIDER_KINDS.SCRIPTED,
  MODELS: {
    COMPLETE: { MODEL_ID: "complete", CONTEXT_WINDOW_TOKENS: 16_000 },
    TITLE: { MODEL_ID: "title", CONTEXT_WINDOW_TOKENS: 16_000 },
  },
  SETTINGS_FIELDS: {
    MODEL_ID: { KEY: "modelId", PATH: "models.modelId" },
    TITLE_MODEL_ID: { KEY: "titleModelId", PATH: "models.titleModelId" },
    CONTEXT_WINDOW_TOKENS: {
      KEY: "contextWindowTokens",
      PATH: "models.contextWindowTokens",
    },
  },
} as const;

export type ScriptedModelConfig = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  modelId: ConfigValue<string>;
  titleModelId: ConfigValue<string>;
  contextWindowTokens: ConfigValue<number>;
}>;

export type ScriptedModelSettings = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  modelId: string;
  titleModelId: string;
  contextWindowTokens: number;
}>;

export function readScriptedModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): ScriptedModelSettings {
  const field = SCRIPTED_PROVIDER.SETTINGS_FIELDS.MODEL_ID;
  return {
    provider: SCRIPTED_PROVIDER.KIND,
    modelId: readRequiredString(models[field.KEY], field.PATH, issues),
    titleModelId: readRequiredString(
      models[SCRIPTED_PROVIDER.SETTINGS_FIELDS.TITLE_MODEL_ID.KEY],
      SCRIPTED_PROVIDER.SETTINGS_FIELDS.TITLE_MODEL_ID.PATH,
      issues,
    ),
    contextWindowTokens: readRequiredPositiveInteger(
      models[SCRIPTED_PROVIDER.SETTINGS_FIELDS.CONTEXT_WINDOW_TOKENS.KEY],
      SCRIPTED_PROVIDER.SETTINGS_FIELDS.CONTEXT_WINDOW_TOKENS.PATH,
      issues,
    ),
  };
}
