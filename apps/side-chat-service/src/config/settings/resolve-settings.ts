import { readSettings } from "./resolution/settings-section-readers.js";
import type { SettingsResult } from "./resolution/settings-contract.js";
import { validateSettingsPolicy } from "./resolution/settings-policy.js";
import type { SettingsIssue } from "./setting-readers.js";

/**
 * Settings boundary mental model: decode the unknown declaration, accumulate
 * secret-safe issues, then apply relationships between valid-looking fields.
 * Provider and runtime behavior remain outside this dependency-free boundary.
 */
export type { Settings, SettingsResult } from "./resolution/settings-contract.js";
export type { SettingsIssue } from "./setting-readers.js";

export function validateSettings(candidate: unknown): SettingsResult {
  const issues: SettingsIssue[] = [];
  const settings = readSettings(candidate, issues);
  if (issues.length > 0) return { ok: false, issues };

  validateSettingsPolicy(settings, issues);
  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, settings: deepFreeze(settings) };
}

export function formatSettingsIssues(issues: readonly SettingsIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
