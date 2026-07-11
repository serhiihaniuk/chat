/** Source-control-safe references from readable config files to deployment input. */
export type ServiceEnv = Readonly<Record<string, string | undefined>>;

/** Complete environment-key vocabulary accepted by the service boundary. */
export const SERVICE_ENV_KEYS = {
  CONFIG_NAME: "SIDECHAT_CONFIG",
  TEST_COMPOSITION: "SIDECHAT_TEST_COMPOSITION",
  WORKFLOW_TARGET_WORLD: "WORKFLOW_TARGET_WORLD",
  WORKFLOW_POSTGRES_URL: "WORKFLOW_POSTGRES_URL",
  WORKFLOW_LOCAL_DATA_DIR: "WORKFLOW_LOCAL_DATA_DIR",
  WORKFLOW_LOCAL_BASE_URL: "WORKFLOW_LOCAL_BASE_URL",
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
  readonly telemetry: {
    readonly enabled: boolean;
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
