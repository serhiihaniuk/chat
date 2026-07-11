export const PROVIDER_SCRIPT_MODE = {
  COMPLETE: "complete",
  TITLE: "title",
  BLOCK: "block",
  HAPPY: "happy",
  MULTI_STEP: "multi-step",
  EMPTY: "empty",
  STEP_LIMIT: "step-limit",
  REASONING_ONLY: "reasoning-only",
  CANCEL_BEFORE_FIRST: "cancel-before-first",
  CANCEL_MID: "cancel-mid",
  ERROR_BEFORE: "error-before",
  ERROR_MID: "error-mid",
} as const;

export type ProviderScriptMode = (typeof PROVIDER_SCRIPT_MODE)[keyof typeof PROVIDER_SCRIPT_MODE];

const PROVIDER_SCRIPT_MODES = new Set<string>(Object.values(PROVIDER_SCRIPT_MODE));

export const LATE_CONTENT_MARKER = "late-content-after-abort";

export function isProviderScriptMode(value: string): value is ProviderScriptMode {
  return PROVIDER_SCRIPT_MODES.has(value);
}
