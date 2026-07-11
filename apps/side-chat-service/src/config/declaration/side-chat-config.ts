/** Source-control-safe references from readable config files to deployment input. */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

/** Complete environment-key vocabulary accepted by the service boundary. */
export const SERVICE_ENV_KEYS = {
  CONFIG_NAME: "SIDECHAT_CONFIG",
  WORKFLOW_TARGET_WORLD: "WORKFLOW_TARGET_WORLD",
  WORKFLOW_POSTGRES_URL: "WORKFLOW_POSTGRES_URL",
  WORKFLOW_LOCAL_DATA_DIR: "WORKFLOW_LOCAL_DATA_DIR",
  WORKFLOW_LOCAL_BASE_URL: "WORKFLOW_LOCAL_BASE_URL",
  OPENAI_API_KEY: "OPENAI_API_KEY",
  OPENAI_BASE_URL: "OPENAI_BASE_URL",
  AZURE_OPENAI_API_KEY: "AZURE_OPENAI_API_KEY",
  AZURE_OPENAI_ENDPOINT: "AZURE_OPENAI_ENDPOINT",
  AZURE_OPENAI_API_VERSION: "AZURE_OPENAI_API_VERSION",
  AZURE_OPENAI_DEPLOYMENT: "AZURE_OPENAI_DEPLOYMENT",
  SIDECHAT_AUTH_TOKEN: "SIDECHAT_AUTH_TOKEN",
  SIDECHAT_WORKSPACE_ID: "SIDECHAT_WORKSPACE_ID",
  SIDECHAT_OTLP_ENDPOINT: "SIDECHAT_OTLP_ENDPOINT",
  SIDECHAT_OTEL_SERVICE_NAME: "SIDECHAT_OTEL_SERVICE_NAME",
} as const;

export type EnvReference = {
  readonly kind: "env";
  readonly key: string;
  readonly valueType: "string" | "number";
  readonly required: boolean;
  readonly secret: boolean;
  readonly defaultValue?: string | number;
};

type EnvOptions<T> = {
  readonly required?: boolean;
  readonly defaultValue?: T;
};

const stringReference = (key: string, options: EnvOptions<string> = {}): EnvReference => ({
  kind: "env",
  key,
  valueType: "string",
  required: options.required ?? false,
  secret: false,
  ...options,
});

export const readEnv = Object.assign(stringReference, {
  secret: (key: string, options: EnvOptions<string> = {}): EnvReference => ({
    ...stringReference(key, { ...options, required: options.required ?? true }),
    secret: true,
  }),
  number: (key: string, options: EnvOptions<number> = {}): EnvReference => ({
    kind: "env",
    key,
    valueType: "number",
    required: options.required ?? false,
    secret: false,
    ...options,
  }),
});

export type ConfigValue<T> = T | EnvReference;

export interface SideChatConfig {
  readonly models:
    | {
        readonly provider: "openai";
        readonly modelId: ConfigValue<string>;
        readonly apiKey: ConfigValue<string>;
        readonly baseUrl?: ConfigValue<string | undefined>;
        readonly reasoningEffort?: "low" | "medium" | "high";
        readonly reasoningSummary?: "auto" | "concise" | "detailed";
      }
    | {
        readonly provider: "azure";
        readonly modelId: ConfigValue<string>;
        readonly deployment: ConfigValue<string>;
        readonly apiKey: ConfigValue<string>;
        readonly endpoint: ConfigValue<string>;
        readonly apiVersion: ConfigValue<string>;
      }
    | { readonly provider: "scripted"; readonly modelId: ConfigValue<string> };
  readonly auth: {
    readonly profile: "development" | "production";
    readonly bearerToken: ConfigValue<string>;
    readonly workspaceId: ConfigValue<string>;
  };
  readonly timeouts: {
    readonly requestMs: ConfigValue<number>;
    readonly queueMs: ConfigValue<number>;
    readonly providerMs: ConfigValue<number>;
  };
  readonly agent: {
    readonly maxSteps: ConfigValue<number>;
    readonly totalTokenBudget: ConfigValue<number>;
    readonly chunkTokenBudget: ConfigValue<number>;
    readonly toolTokenBudget: ConfigValue<number>;
  };
  readonly capacity: {
    readonly activeGenerations: ConfigValue<number>;
  };
  readonly keepalive: {
    readonly intervalMs: ConfigValue<number>;
    readonly proxyIdleBudgetMs: ConfigValue<number>;
  };
  readonly telemetry:
    | { readonly mode: "off" }
    | { readonly mode: "console" }
    | {
        readonly mode: "otlp";
        readonly endpoint: ConfigValue<string>;
        readonly serviceName: ConfigValue<string>;
      };
  readonly workflow: {
    readonly workerConcurrency: ConfigValue<number>;
    readonly concurrencyHeadroom: ConfigValue<number>;
    readonly journalArchiveAfterDays: ConfigValue<number>;
    readonly journalPruneAfterDays: ConfigValue<number>;
    readonly postgresUrl: ConfigValue<string | undefined>;
  };
}

export const defineSideChatConfig = <const Config extends SideChatConfig>(config: Config): Config =>
  Object.freeze(config);
