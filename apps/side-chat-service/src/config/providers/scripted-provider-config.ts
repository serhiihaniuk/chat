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

export const SCRIPTED_PROVIDER = {
  KIND: PROVIDER_KINDS.SCRIPTED,
  MODELS: {
    COMPLETE: { MODEL_ID: "complete", CONTEXT_WINDOW_TOKENS: 16_000 },
    TITLE: { MODEL_ID: "title", CONTEXT_WINDOW_TOKENS: 16_000 },
    BLOCK: { MODEL_ID: "block", CONTEXT_WINDOW_TOKENS: 16_000 },
    HAPPY: { MODEL_ID: "happy", CONTEXT_WINDOW_TOKENS: 16_000 },
    MULTI_STEP: { MODEL_ID: "multi-step", CONTEXT_WINDOW_TOKENS: 16_000 },
    EMPTY: { MODEL_ID: "empty", CONTEXT_WINDOW_TOKENS: 16_000 },
    STEP_LIMIT: { MODEL_ID: "step-limit", CONTEXT_WINDOW_TOKENS: 16_000 },
    REASONING_ONLY: {
      MODEL_ID: "reasoning-only",
      CONTEXT_WINDOW_TOKENS: 16_000,
    },
    CLIENT_TOOL: { MODEL_ID: "client-tool", CONTEXT_WINDOW_TOKENS: 16_000 },
    NATIVE_APPROVAL_GAP: {
      MODEL_ID: "native-approval-gap",
      CONTEXT_WINDOW_TOKENS: 16_000,
    },
    CANCEL_BEFORE_FIRST: {
      MODEL_ID: "cancel-before-first",
      CONTEXT_WINDOW_TOKENS: 16_000,
    },
    CANCEL_MID: { MODEL_ID: "cancel-mid", CONTEXT_WINDOW_TOKENS: 16_000 },
    ERROR_BEFORE: { MODEL_ID: "error-before", CONTEXT_WINDOW_TOKENS: 16_000 },
    ERROR_MID: { MODEL_ID: "error-mid", CONTEXT_WINDOW_TOKENS: 16_000 },
  },
} as const;

type ScriptedAvailableModelConfig = Readonly<{
  id: ConfigValue<string>;
  contextWindowTokens: ConfigValue<number>;
}>;

export type ScriptedModelConfig = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  defaultModelId: ConfigValue<string>;
  availableModels: readonly ScriptedAvailableModelConfig[];
}>;

export type ScriptedAvailableModelSettings = Readonly<{
  id: string;
  contextWindowTokens: number;
}>;

export type ScriptedModelSettings = Readonly<{
  provider: typeof SCRIPTED_PROVIDER.KIND;
  defaultModelId: string;
  availableModels: readonly ScriptedAvailableModelSettings[];
}>;

export function readScriptedModelSettings(
  models: SettingsObject,
  issues: SettingsIssue[],
): ScriptedModelSettings {
  return {
    provider: SCRIPTED_PROVIDER.KIND,
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
): ScriptedAvailableModelSettings {
  const path = `models.availableModels.${index}`;
  const model = readObject(candidate, path, issues);
  return {
    id: readRequiredString(model["id"], `${path}.id`, issues),
    contextWindowTokens: readRequiredPositiveInteger(
      model["contextWindowTokens"],
      `${path}.contextWindowTokens`,
      issues,
    ),
  };
}
