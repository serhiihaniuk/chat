export type SettingsIssue = {
  readonly path: string;
  readonly message: string;
};

export type SettingsObject = Readonly<Record<string, unknown>>;

export function readObject(value: unknown, path: string, issues: SettingsIssue[]): SettingsObject {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  issues.push({ path, message: "must be an object" });
  return {};
}

export function readRequiredString(value: unknown, path: string, issues: SettingsIssue[]): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  issues.push({ path, message: "must be a non-empty string" });
  return "";
}

export function readOptionalString(
  value: unknown,
  path: string,
  issues: SettingsIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  const parsed = readRequiredString(value, path, issues);
  return parsed.length === 0 ? undefined : parsed;
}

export function readRequiredCatalogValue<const Value extends string>(
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

export function readOptionalCatalogValue<const Value extends string>(
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
