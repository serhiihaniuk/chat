declare const brandSymbol: unique symbol;

/**
 * Nominal marker for primitive values that should not be interchangeable.
 *
 * Runtime values stay unchanged. Raw primitives remain assignable because these
 * are soft brands, while values already branded as different concepts stop
 * being interchangeable. Boundary code should still use the owning constructor
 * so the conversion is visible and searchable.
 */
export type Brand<Value, Name extends string> = Value & {
  readonly [brandSymbol]?: Name;
};

export const brandString = <Name extends string>(value: string): Brand<string, Name> => value;

export const brandNumber = <Name extends string>(value: number): Brand<number, Name> => value;

export type OmitUndefinedField<Key extends string, Value> = {
  readonly [Field in Key]?: Exclude<Value, undefined>;
};

export type OmitNullishField<Key extends string, Value> = {
  readonly [Field in Key]?: NonNullable<Value>;
};

type UndefinedPropertyKeys<Value extends object> = {
  [Key in keyof Value]-?: undefined extends Value[Key] ? Key : never;
}[keyof Value];

type DefinedPropertyKeys<Value extends object> = Exclude<keyof Value, UndefinedPropertyKeys<Value>>;

type SimplifyObject<Value extends object> = {
  readonly [Key in keyof Value]: Value[Key];
};

export type OmitUndefinedProperties<Value extends object> = SimplifyObject<
  {
    readonly [Key in DefinedPropertyKeys<Value>]: Value[Key];
  } & {
    readonly [Key in UndefinedPropertyKeys<Value>]?: Exclude<Value[Key], undefined>;
  }
>;

export function omitUndefinedField<Key extends string, Value>(
  key: Key,
  value: Value,
): OmitUndefinedField<Key, Value>;
export function omitUndefinedField(key: string, value: unknown): object {
  return value === undefined ? {} : { [key]: value };
}

/**
 * Shallowly omit own enumerable string-keyed properties whose value is undefined.
 */
export function omitUndefinedProperties<const Value extends object>(
  value: Value,
): OmitUndefinedProperties<Value>;
export function omitUndefinedProperties(value: object): object {
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) output[key] = entry;
  }
  return output;
}

export function omitNullishField<Key extends string, Value>(
  key: Key,
  value: Value,
): OmitNullishField<Key, Value>;
export function omitNullishField(key: string, value: unknown): object {
  return value === null || value === undefined ? {} : { [key]: value };
}

export {
  asRecord,
  compactJsonObject,
  isRecord,
  parseJsonRecord,
  toJsonObject,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
} from "./json.js";
export { redactAttributes, safeJsonPrimitive } from "./redaction.js";
export {
  DIAGNOSTIC_LOG_LEVELS,
  SILENT_DIAGNOSTIC_LOGGER,
  shouldEmitDiagnostic,
  type DiagnosticLogFields,
  type DiagnosticLogLevel,
  type DiagnosticLogger,
} from "./diagnostic-logger.js";
