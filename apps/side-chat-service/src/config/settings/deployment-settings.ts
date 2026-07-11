import type { SettingsIssue } from "./resolve-settings.js";

export type ModelSettings =
  | Readonly<{
      provider: "openai";
      modelId: string;
      apiKey: string;
      baseUrl?: string | undefined;
      reasoningEffort?: "low" | "medium" | "high" | undefined;
      reasoningSummary?: "auto" | "concise" | "detailed" | undefined;
    }>
  | Readonly<{
      provider: "azure";
      modelId: string;
      deployment: string;
      apiKey: string;
      endpoint: string;
      apiVersion: string;
    }>
  | Readonly<{ provider: "scripted"; modelId: string }>;

export type AuthSettings = Readonly<{
  profile: "development" | "production";
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
      profile: readRequiredEnum(
        auth["profile"],
        "auth.profile",
        ["development", "production"],
        "development",
        issues,
      ),
      bearerToken: readString(auth["bearerToken"], "auth.bearerToken", issues),
      workspaceId: readString(auth["workspaceId"], "auth.workspaceId", issues),
    },
  };
}

function readModelSettings(
  models: Readonly<Record<string, unknown>>,
  issues: SettingsIssue[],
): ModelSettings {
  const provider = readRequiredEnum(
    models["provider"],
    "models.provider",
    ["openai", "azure", "scripted"],
    "scripted",
    issues,
  );
  const modelId = readString(models["modelId"], "models.modelId", issues);
  if (provider === "azure") {
    return {
      provider,
      modelId,
      deployment: readString(models["deployment"], "models.deployment", issues),
      apiKey: readString(models["apiKey"], "models.apiKey", issues),
      endpoint: readString(models["endpoint"], "models.endpoint", issues),
      apiVersion: readString(models["apiVersion"], "models.apiVersion", issues),
    };
  }
  if (provider === "openai") {
    return {
      provider,
      modelId,
      apiKey: readString(models["apiKey"], "models.apiKey", issues),
      baseUrl: readOptionalString(models["baseUrl"], "models.baseUrl", issues),
      reasoningEffort: readOptionalEnum(
        models["reasoningEffort"],
        "models.reasoningEffort",
        ["low", "medium", "high"],
        issues,
      ),
      reasoningSummary: readOptionalEnum(
        models["reasoningSummary"],
        "models.reasoningSummary",
        ["auto", "concise", "detailed"],
        issues,
      ),
    };
  }
  return { provider: "scripted", modelId };
}

function readObject(
  value: unknown,
  path: string,
  issues: SettingsIssue[],
): Readonly<Record<string, unknown>> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  issues.push({ path, message: "must be an object" });
  return {};
}

function readString(value: unknown, path: string, issues: SettingsIssue[]): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  issues.push({ path, message: "must be a non-empty string" });
  return "";
}

function readOptionalString(
  value: unknown,
  path: string,
  issues: SettingsIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  const parsed = readString(value, path, issues);
  return parsed === "" ? undefined : parsed;
}

function readRequiredEnum<const Value extends string>(
  value: unknown,
  path: string,
  allowed: readonly Value[],
  fallback: Value,
  issues: SettingsIssue[],
): Value {
  const match = allowed.find((candidate) => candidate === value);
  if (match !== undefined) return match;
  issues.push({ path, message: `must be one of: ${allowed.join(", ")}` });
  return fallback;
}

function readOptionalEnum<const Value extends string>(
  value: unknown,
  path: string,
  allowed: readonly Value[],
  issues: SettingsIssue[],
): Value | undefined {
  if (value === undefined) return undefined;
  const match = allowed.find((candidate) => candidate === value);
  if (match !== undefined) return match;
  issues.push({ path, message: `must be one of: ${allowed.join(", ")}` });
  return undefined;
}
