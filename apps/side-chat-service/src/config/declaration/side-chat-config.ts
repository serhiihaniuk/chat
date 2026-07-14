import type { AzureModelConfig } from "../providers/azure-provider-config.js";
import type { OpenAIModelConfig } from "../providers/openai-provider-config.js";
import type { ScriptedModelConfig } from "../providers/scripted-provider-config.js";

/** Source-control-safe references from readable config files to deployment input. */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

/** Complete environment-key vocabulary accepted by the service boundary. */
export const SERVICE_ENV_KEYS = {
  CONFIG_NAME: "SIDECHAT_CONFIG",
  WORKFLOW_TARGET_WORLD: "WORKFLOW_TARGET_WORLD",
  WORKFLOW_POSTGRES_URL: "WORKFLOW_POSTGRES_URL",
  WORKFLOW_LOCAL_DATA_DIR: "WORKFLOW_LOCAL_DATA_DIR",
  WORKFLOW_LOCAL_BASE_URL: "WORKFLOW_LOCAL_BASE_URL",
  SIDECHAT_DATABASE_URL: "SIDECHAT_DATABASE_URL",
  SIDECHAT_AUTH_TOKEN: "SIDECHAT_AUTH_TOKEN",
  SIDECHAT_WORKSPACE_ID: "SIDECHAT_WORKSPACE_ID",
  SIDECHAT_OTLP_ENDPOINT: "SIDECHAT_OTLP_ENDPOINT",
  SIDECHAT_OTEL_SERVICE_NAME: "SIDECHAT_OTEL_SERVICE_NAME",
} as const;

export const AUTH_PROFILES = {
  DEVELOPMENT: "development",
  PRODUCTION: "production",
} as const;

export const TELEMETRY_MODES = {
  OFF: "off",
  CONSOLE: "console",
  OTLP: "otlp",
} as const;

export const WORKFLOW_JOURNAL_CLASSES = {
  OPERATIONAL: "operational",
  RECORD: "record",
} as const;

export const AUTH_PROFILE_VALUES = Object.values(AUTH_PROFILES);
export const TELEMETRY_MODE_VALUES = Object.values(TELEMETRY_MODES);
export const WORKFLOW_JOURNAL_CLASS_VALUES = Object.values(WORKFLOW_JOURNAL_CLASSES);

export type AuthProfile = (typeof AUTH_PROFILE_VALUES)[number];
export type TelemetryMode = (typeof TELEMETRY_MODE_VALUES)[number];
export type WorkflowJournalClass = (typeof WORKFLOW_JOURNAL_CLASS_VALUES)[number];

export const ENV_REFERENCE_KINDS = { ENV: "env" } as const;
export const ENV_VALUE_TYPES = { STRING: "string", NUMBER: "number" } as const;

export type EnvReference = {
  readonly kind: typeof ENV_REFERENCE_KINDS.ENV;
  readonly key: string;
  readonly valueType: (typeof ENV_VALUE_TYPES)[keyof typeof ENV_VALUE_TYPES];
  readonly required: boolean;
  readonly secret: boolean;
  readonly defaultValue?: string | number;
};

type EnvOptions<T> = {
  readonly required?: boolean;
  readonly defaultValue?: T;
};

type ReadEnv = {
  (key: string, options?: EnvOptions<string>): EnvReference;
  readonly secret: (key: string, options?: EnvOptions<string>) => EnvReference;
  readonly number: (key: string, options?: EnvOptions<number>) => EnvReference;
};

const stringReference = (key: string, options: EnvOptions<string> = {}): EnvReference =>
  createEnvReference(
    key,
    ENV_VALUE_TYPES.STRING,
    options.required ?? false,
    false,
    options.defaultValue,
  );

export const readEnv: ReadEnv = Object.assign(stringReference, {
  secret: (key: string, options: EnvOptions<string> = {}): EnvReference =>
    createEnvReference(
      key,
      ENV_VALUE_TYPES.STRING,
      options.required ?? true,
      true,
      options.defaultValue,
    ),
  number: (key: string, options: EnvOptions<number> = {}): EnvReference =>
    createEnvReference(
      key,
      ENV_VALUE_TYPES.NUMBER,
      options.required ?? false,
      false,
      options.defaultValue,
    ),
});

export type ConfigValue<T> = T | EnvReference;

export interface SideChatConfig {
  readonly models: OpenAIModelConfig | AzureModelConfig | ScriptedModelConfig;
  readonly conversationTitle: {
    readonly modelId: ConfigValue<string>;
    readonly timeoutMs: ConfigValue<number>;
  };
  /** Registered server-tool names exposed by this deployment. */
  readonly serverTools: readonly string[];
  /** Limits applied to optional browser-supplied page reference data. */
  readonly hostContext: {
    readonly maxSerializedBytes: ConfigValue<number>;
    readonly maxStringLength: ConfigValue<number>;
    readonly maxMetadataDepth: ConfigValue<number>;
    readonly maxMetadataEntries: ConfigValue<number>;
  };
  readonly auth: {
    readonly profile: AuthProfile;
    readonly bearerToken: ConfigValue<string>;
    readonly workspaceId: ConfigValue<string>;
  };
  readonly timeouts: {
    readonly queueMs: ConfigValue<number>;
    readonly providerMs: ConfigValue<number>;
    readonly clientToolMs: ConfigValue<number>;
  };
  readonly agent: {
    readonly instructions: ConfigValue<string>;
    readonly maxSteps: ConfigValue<number>;
  };
  readonly persistence: {
    /** Product Postgres URL. Absent selects the in-memory store (development only). */
    readonly databaseUrl: ConfigValue<string | undefined>;
  };
  readonly keepalive: {
    readonly intervalMs: ConfigValue<number>;
  };
  readonly telemetry:
    | { readonly mode: typeof TELEMETRY_MODES.OFF }
    | { readonly mode: typeof TELEMETRY_MODES.CONSOLE }
    | {
        readonly mode: typeof TELEMETRY_MODES.OTLP;
        readonly endpoint: ConfigValue<string>;
        readonly serviceName: ConfigValue<string>;
      };
  readonly workflow: {
    readonly journalPruneAfterDays: ConfigValue<number>;
    readonly journalSweepIntervalMs: ConfigValue<number>;
    readonly journalClass: WorkflowJournalClass;
    readonly postgresUrl: ConfigValue<string | undefined>;
  };
}

export const defineSideChatConfig = <const Config extends SideChatConfig>(config: Config): Config =>
  Object.freeze(config);

function createEnvReference(
  key: string,
  valueType: EnvReference["valueType"],
  required: boolean,
  secret: boolean,
  defaultValue: string | number | undefined,
): EnvReference {
  if (defaultValue === undefined) {
    return { kind: ENV_REFERENCE_KINDS.ENV, key, valueType, required, secret };
  }
  return {
    kind: ENV_REFERENCE_KINDS.ENV,
    key,
    valueType,
    required,
    secret,
    defaultValue,
  };
}
