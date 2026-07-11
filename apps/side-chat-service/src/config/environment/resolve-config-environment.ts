import {
  ENV_REFERENCE_KINDS,
  ENV_VALUE_TYPES,
  type EnvReference,
  type ServiceEnv,
} from "../declaration/side-chat-config.js";
import type { SettingsIssue } from "../settings/resolve-settings.js";

export type ResolvedConfigCandidate = {
  readonly value: unknown;
  readonly issues: readonly SettingsIssue[];
};

/** Resolve deployment inputs without exposing secret values in diagnostics. */
export function resolveConfigEnvironment(
  config: unknown,
  environment: ServiceEnv,
): ResolvedConfigCandidate {
  const issues: SettingsIssue[] = [];
  return { value: resolveValue(config, environment, [], issues), issues };
}

function resolveValue(
  value: unknown,
  environment: ServiceEnv,
  path: readonly string[],
  issues: SettingsIssue[],
): unknown {
  if (isEnvReference(value)) return resolveReference(value, environment, path.join("."), issues);
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      resolveValue(item, environment, [...path, String(index)], issues),
    );
  }
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      resolveValue(item, environment, [...path, key], issues),
    ]),
  );
}

function resolveReference(
  reference: EnvReference,
  environment: ServiceEnv,
  path: string,
  issues: SettingsIssue[],
): string | number | undefined {
  const rawValue = environment[reference.key]?.trim();
  if (!rawValue) return resolveMissingReference(reference, path, issues);
  if (reference.valueType === ENV_VALUE_TYPES.STRING) return rawValue;

  const numericValue = Number(rawValue);
  if (Number.isFinite(numericValue)) return numericValue;
  issues.push({ path, message: `${reference.key} must be a number` });
  return undefined;
}

function resolveMissingReference(
  reference: EnvReference,
  path: string,
  issues: SettingsIssue[],
): string | number | undefined {
  if (reference.defaultValue !== undefined) return reference.defaultValue;
  if (reference.required) issues.push({ path, message: `${reference.key} is required` });
  return undefined;
}

function isEnvReference(value: unknown): value is EnvReference {
  return isRecord(value) && value["kind"] === ENV_REFERENCE_KINDS.ENV;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}
