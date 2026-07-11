import type { ConfigValue } from "../declaration/side-chat-config.js";
import {
  readRequiredString,
  type SettingsIssue,
  type SettingsObject,
} from "../settings/setting-readers.js";

import { PROVIDER_KINDS } from "./provider-config.js";

export const SCRIPTED_PROVIDER = {
  KIND: PROVIDER_KINDS.SCRIPTED,
  MODELS: {
    COMPLETE: { MODEL_ID: "complete" },
  },
  SETTINGS_FIELDS: {
    MODEL_ID: { KEY: "modelId", PATH: "models.modelId" },
  },
} as const;

export type ScriptedModelConfig = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  modelId: ConfigValue<string>;
}>;

export type ScriptedModelSettings = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  modelId: string;
}>;

export function readScriptedModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): ScriptedModelSettings {
  const field = SCRIPTED_PROVIDER.SETTINGS_FIELDS.MODEL_ID;
  return {
    provider: SCRIPTED_PROVIDER.KIND,
    modelId: readRequiredString(models[field.KEY], field.PATH, issues),
  };
}
