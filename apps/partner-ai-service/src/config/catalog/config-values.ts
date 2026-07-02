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

/**
 * Default resumable-streaming operator tunables.
 *
 * `SAFETY_POLL_INTERVAL_MS` is the per-subscriber reconcile cadence — a
 * low-frequency backstop for a missed Postgres `NOTIFY`. It is deliberately
 * slower than the notify path so the poll adds little load while still bounding
 * how long a dropped signal can stall a live subscriber.
 *
 * The lease tunables fence dead or slow owners. `LEASE_TTL_MS` is how long an
 * owner's claim stays valid; `HEARTBEAT_INTERVAL_MS` is comfortably under it so a
 * live owner renews several times before expiry; `REAPER_INTERVAL_MS` is how often
 * an instance sweeps expired-lease running turns. `REAPER_BATCH_LIMIT` bounds one
 * sweep so a backlog drains over several passes instead of one large transaction.
 *
 */
export const RESUMABILITY_DEFAULTS = {
  SAFETY_POLL_INTERVAL_MS: 2_000,
  LEASE_TTL_MS: 30_000,
  HEARTBEAT_INTERVAL_MS: 10_000,
  REAPER_INTERVAL_MS: 15_000,
  REAPER_BATCH_LIMIT: 100,
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
