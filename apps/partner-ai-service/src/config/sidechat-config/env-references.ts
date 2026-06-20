/**
 * Env references are source-control-safe pointers from config to deployment env.
 *
 * `sidechat.config.ts` should show every relevant env key, but it must not read
 * secrets while the module is imported. These declarations preserve the key,
 * fallback, and secrecy metadata; service boot resolves the actual values later.
 */
export const SIDECHAT_ENV_VALUE_TYPES = {
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
} as const;

export type SideChatEnvValueType =
  (typeof SIDECHAT_ENV_VALUE_TYPES)[keyof typeof SIDECHAT_ENV_VALUE_TYPES];

type SideChatEnvReferenceBase = {
  /** Name of the process env key to read at service startup. */
  readonly key: string;
  /** Whether startup should fail when the env value and default are both absent. */
  readonly required?: boolean | undefined;
  /** Human-facing note shown in editor hovers for why this env value exists. */
  readonly description?: string | undefined;
};

/**
 * String value declared in `sidechat.config.ts` and resolved from `.env` later.
 *
 * The config stores the env key and fallback metadata, not the secret value.
 * Service adapters resolve it during boot so credentials and endpoints remain
 * out of source control, diagnostics, `/models`, and browser-visible manifests.
 */
export type SideChatStringEnvReference = SideChatEnvReferenceBase & {
  readonly valueType: typeof SIDECHAT_ENV_VALUE_TYPES.STRING;
  /** Marks a value as secret so config readers know it must not enter diagnostics. */
  readonly secret?: boolean | undefined;
  /** Fallback used when the process env key is absent or blank. */
  readonly defaultValue?: string | undefined;
};

/** Numeric process env value, usually a port or deployment budget. */
export type SideChatNumberEnvReference = SideChatEnvReferenceBase & {
  readonly valueType: typeof SIDECHAT_ENV_VALUE_TYPES.NUMBER;
  /** Fallback used when the process env key is absent or blank. */
  readonly defaultValue?: number | undefined;
};

/** Boolean process env flag represented as `true` or `false`. */
export type SideChatBooleanEnvReference = SideChatEnvReferenceBase & {
  readonly valueType: typeof SIDECHAT_ENV_VALUE_TYPES.BOOLEAN;
  /** Fallback used when the process env key is absent or blank. */
  readonly defaultValue?: boolean | undefined;
};

export type SideChatEnvReference =
  | SideChatStringEnvReference
  | SideChatNumberEnvReference
  | SideChatBooleanEnvReference;

export type SideChatStringEnvOptions = {
  readonly required?: boolean | undefined;
  readonly secret?: boolean | undefined;
  readonly defaultValue?: string | undefined;
  readonly description?: string | undefined;
};

export type SideChatNumberEnvOptions = {
  readonly required?: boolean | undefined;
  readonly defaultValue?: number | undefined;
  readonly description?: string | undefined;
};

export type SideChatBooleanEnvOptions = {
  readonly required?: boolean | undefined;
  readonly defaultValue?: boolean | undefined;
  readonly description?: string | undefined;
};

export type SideChatReadEnv = {
  /** Declare a string env value that should be visible in `sidechat.config.ts`. */
  (key: string, options?: SideChatStringEnvOptions): SideChatStringEnvReference;
  /** Declare an optional string env value. */
  readonly optional: (
    key: string,
    options?: Omit<SideChatStringEnvOptions, "required">,
  ) => SideChatStringEnvReference;
  /** Declare a secret string env value, such as an API key or bearer token. */
  readonly secret: (key: string, options?: SideChatStringEnvOptions) => SideChatStringEnvReference;
  /** Declare a numeric env value. */
  readonly number: (key: string, options?: SideChatNumberEnvOptions) => SideChatNumberEnvReference;
  /** Declare a boolean env value. */
  readonly boolean: (
    key: string,
    options?: SideChatBooleanEnvOptions,
  ) => SideChatBooleanEnvReference;
};

const createStringEnvReference = (
  key: string,
  options: SideChatStringEnvOptions = {},
): SideChatStringEnvReference => ({
  valueType: SIDECHAT_ENV_VALUE_TYPES.STRING,
  key,
  ...options,
});

const createNumberEnvReference = (
  key: string,
  options: SideChatNumberEnvOptions = {},
): SideChatNumberEnvReference => ({
  valueType: SIDECHAT_ENV_VALUE_TYPES.NUMBER,
  key,
  ...options,
});

const createBooleanEnvReference = (
  key: string,
  options: SideChatBooleanEnvOptions = {},
): SideChatBooleanEnvReference => ({
  valueType: SIDECHAT_ENV_VALUE_TYPES.BOOLEAN,
  key,
  ...options,
});

export const readEnv: SideChatReadEnv = Object.assign(createStringEnvReference, {
  optional: (key: string, options: Omit<SideChatStringEnvOptions, "required"> = {}) =>
    createStringEnvReference(key, { ...options, required: false }),
  secret: (key: string, options: SideChatStringEnvOptions = {}) =>
    createStringEnvReference(key, {
      ...options,
      required: options.required ?? true,
      secret: true,
    }),
  number: createNumberEnvReference,
  boolean: createBooleanEnvReference,
});
