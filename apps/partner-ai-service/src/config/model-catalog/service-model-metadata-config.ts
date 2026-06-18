import type { RuntimeModelMetadata } from "#composition/service-composition";
import { ServiceConfigError } from "../service-config-error.js";
import { omitUndefinedProperties } from "@side-chat/shared";

type ServiceEnv = Readonly<Record<string, string | undefined>>;

const MODEL_CONTEXT_WINDOWS_ENV_KEY = "SIDECHAT_MODEL_CONTEXT_WINDOWS";

const KNOWN_MODEL_METADATA: Readonly<
  Record<string, { readonly contextWindowTokens: number; readonly maxOutputTokens: number }>
> = {
  "gpt-5.4-mini": { contextWindowTokens: 400_000, maxOutputTokens: 128_000 },
  "gpt-5.5": { contextWindowTokens: 1_000_000, maxOutputTokens: 128_000 },
};

export const createModelMetadata = (
  modelIds: readonly string[],
  env: ServiceEnv,
): readonly RuntimeModelMetadata[] => {
  const contextWindowOverrides = readModelContextWindowOverrides(env);
  return modelIds.map((modelId) => {
    const knownMetadata = KNOWN_MODEL_METADATA[modelId];
    return omitUndefinedProperties({
      modelId,
      displayName: toModelDisplayName(modelId),
      contextWindowTokens:
        contextWindowOverrides.get(modelId) ?? knownMetadata?.contextWindowTokens,
      maxOutputTokens: knownMetadata?.maxOutputTokens,
    });
  });
};

const readModelContextWindowOverrides = (env: ServiceEnv): ReadonlyMap<string, number> => {
  const rawWindows = env[MODEL_CONTEXT_WINDOWS_ENV_KEY]?.trim();
  if (!rawWindows) return new Map();

  return new Map(
    rawWindows
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map(readModelContextWindowEntry),
  );
};

const readModelContextWindowEntry = (entry: string): readonly [string, number] => {
  const [rawModelId, rawTokens] = entry.includes("=") ? entry.split("=") : entry.split(":");
  const modelId = rawModelId?.trim();
  const tokens = rawTokens?.trim();
  if (!modelId || !tokens) {
    throw new ServiceConfigError("SIDECHAT_MODEL_CONTEXT_WINDOWS entries must use modelId:tokens.");
  }
  return [modelId, readPositiveInteger(tokens)];
};

const readPositiveInteger = (rawValue: string): number => {
  if (!/^\d+$/.test(rawValue)) {
    throw new ServiceConfigError("SIDECHAT_MODEL_CONTEXT_WINDOWS values must be positive integers.");
  }

  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ServiceConfigError("SIDECHAT_MODEL_CONTEXT_WINDOWS values must be positive integers.");
  }
  return value;
};

const toModelDisplayName = (modelId: string): string => {
  if (modelId.startsWith("gpt-")) return `GPT-${modelId.slice(4).replaceAll("-", " ")}`;
  return modelId
    .split("-")
    .map((part) => (part ? `${part[0]?.toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
};
