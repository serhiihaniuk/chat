import {
  OUTPUT_FORMATS,
  PROMPT_INJECTION_MODES,
  TOOL_POLICY_MODES,
} from "@side-chat/partner-ai-core";

export {
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

export const LOG_FORMATS = {
  PRETTY: "pretty",
  JSON: "json",
} as const;

export type LogFormatValue = ObjectValue<typeof LOG_FORMATS>;

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

/**
 * Default timings for resumable streaming.
 *
 * The safety poll checks the event registry when a database notification is
 * missed. It runs less often than the notification path to limit database load.
 *
 * Lease settings decide when an owner is considered dead. The heartbeat runs
 * several times before the lease expires. The reaper checks expired leases and
 * limits each sweep so a large backlog is handled in smaller transactions.
 *
 * The SSE heartbeat keeps quiet connections alive through load balancers. It is
 * separate from the owner-lease heartbeat and must run before the widget's
 * inactivity watchdog fires.
 */
export const RESUMABILITY_DEFAULTS = {
  SAFETY_POLL_INTERVAL_MS: 2_000,
  LEASE_TTL_MS: 30_000,
  HEARTBEAT_INTERVAL_MS: 10_000,
  REAPER_INTERVAL_MS: 15_000,
  REAPER_BATCH_LIMIT: 100,
  SSE_HEARTBEAT_INTERVAL_MS: 20_000,
  OUTPUT_DELTA_FLUSH_INTERVAL_MS: 250,
} as const;

/**
 * Stable per-process owner identity written to `owner_instance_id`.
 *
 * A real deployment sets `SIDECHAT_INSTANCE_ID` per replica (e.g. the pod name) so
 * lease ownership is attributable and fencing works across instances. The dev
 * default is unique per process so a single local instance still owns its leases
 * without collision after a restart.
 */
export const DEFAULT_INSTANCE_ID = `instance_local_${process.pid}`;
