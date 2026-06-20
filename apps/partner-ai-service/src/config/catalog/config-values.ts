import {
  OUTPUT_FORMATS,
  PROMPT_INJECTION_MODES,
  TOOL_POLICY_MODES,
} from "@side-chat/partner-ai-core";

export {
  APPROVAL_MODES,
  CONTEXT_ADMISSION_POLICIES,
  HISTORY_CONTEXT_MODES,
  OUTPUT_FORMATS,
  PROMPT_INJECTION_MODES,
  TOOL_POLICY_MODES,
} from "@side-chat/partner-ai-core";

type ObjectValue<T extends Readonly<Record<string, string>>> = T[keyof T];

/**
 * Closed service-config values that are not owned by a provider or tool.
 *
 * These are the ids and modes a readable service config may import directly.
 * Human-authored text still belongs in config, but closed product values live
 * here or in the package that owns their contract.
 */
export const CONFIG_IDS = {
  TURN_PROFILES: {
    DEFAULT: "default",
  },
  SYSTEM_PROMPTS: {
    DEFAULT_TURN_PROFILE: "runtime_default_profile",
  },
  PROMPT_SECTIONS: {
    OUTPUT_FORMATTING: "output_formatting",
  },
} as const;

export const SERVICE_PROFILES = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
} as const;

export type ServiceProfileValue = ObjectValue<typeof SERVICE_PROFILES>;

export const REQUEST_POLICY_MODES = {
  ALLOW_ALL: "allow_all",
  FAIL_CLOSED: "fail_closed",
  CONFIGURED: "configured",
} as const;

export type RequestPolicyMode = ObjectValue<typeof REQUEST_POLICY_MODES>;

export const TOOL_DEFAULT_EXPOSURE = {
  ENABLED: "enabled",
  DISABLED: "disabled",
} as const;

export type ToolDefaultExposure = ObjectValue<typeof TOOL_DEFAULT_EXPOSURE>;

export const SAFETY_POLICIES = {
  STANDARD: {
    ID: "standard",
    LABEL: "Standard safety policy",
    DEFAULT_PROMPT_INJECTION_MODE: PROMPT_INJECTION_MODES.STANDARD,
    PROMPT_INJECTION_OPTIONS: [PROMPT_INJECTION_MODES.STANDARD, PROMPT_INJECTION_MODES.STRICT],
  },
} as const;

export const DEFAULT_OUTPUT_CONTRACT = {
  format: OUTPUT_FORMATS.MARKDOWN,
} as const;

export const DEFAULT_TOOL_POLICY = {
  CLOSED: { mode: TOOL_POLICY_MODES.CLOSED, allowedToolNames: [] },
} as const;
