declare const brandSymbol: unique symbol;

/**
 * Nominal marker for primitive values that should not be interchangeable.
 *
 * Runtime values stay unchanged. Raw primitives can still enter contracts for a
 * low-churn rollout, while values already branded as different concepts stop
 * being interchangeable.
 */
export type Brand<Value, Name extends string> = Value & {
  readonly [brandSymbol]?: Name;
};

export const brandString = <Name extends string>(value: string): Brand<string, Name> => value;

export const brandNumber = <Name extends string>(value: number): Brand<number, Name> => value;

/**
 * JSON values that are safe to place on Side Chat protocol payloads.
 *
 * Shared packages use this type at serialization boundaries so adapters,
 * clients, and widgets agree on the same JSON surface without depending on the
 * protocol package.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * Narrow unknown values to plain object records.
 *
 * Arrays are intentionally excluded because callers usually need to treat JSON
 * arrays and keyed records differently when reading transport payloads.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Turn unknown input into a JSON object.
 *
 * Undefined fields are omitted. Non-finite numbers become null. Bigints and
 * symbols become strings when possible. A scalar root is wrapped as `{ value }`
 * so callers always receive an object.
 */
export const toJsonObject = (value: unknown): JsonObject => {
  if (!isRecord(value)) return { value: toJsonValue(value) };

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      entry === undefined ? [] : [[key, toJsonValue(entry)]],
    ),
  ) as JsonObject;
};

const toJsonValue = (value: unknown): JsonValue => {
  if (Array.isArray(value)) return value.map((entry) => toJsonValue(entry));
  if (isRecord(value)) return toJsonObject(value);
  return toJsonScalar(value);
};

const toJsonScalar = (value: unknown): JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? null;
  return null;
};

/**
 * Build a JSON object from already-normalized optional fields.
 *
 * Use this when the caller owns the field values and only needs the common
 * "omit undefined" behavior without recursively coercing scalars.
 */
export const compactJsonObject = (
  value: Readonly<Record<string, JsonValue | undefined>>,
): JsonObject => {
  const json: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) json[key] = entry;
  }
  return json;
};

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

export const omitUndefinedField = <Key extends string, Value>(
  key: Key,
  value: Value,
): OmitUndefinedField<Key, Value> =>
  value === undefined ? {} : ({ [key]: value } as OmitUndefinedField<Key, Value>);

/**
 * Shallowly omit own enumerable string-keyed properties whose value is undefined.
 */
export const omitUndefinedProperties = <const Value extends object>(
  value: Value,
): OmitUndefinedProperties<Value> => {
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value) as Array<keyof Value & string>) {
    const entry = value[key];
    if (entry !== undefined) output[key] = entry;
  }
  return output as OmitUndefinedProperties<Value>;
};

export const omitNullishField = <Key extends string, Value>(
  key: Key,
  value: Value,
): OmitNullishField<Key, Value> =>
  value === null || value === undefined ? {} : ({ [key]: value } as OmitNullishField<Key, Value>);

export { redactAttributes, safeJsonPrimitive } from "./redaction.js";
export {
  DIAGNOSTIC_LOG_LEVELS,
  SILENT_DIAGNOSTIC_LOGGER,
  shouldEmitDiagnostic,
  type DiagnosticLogFields,
  type DiagnosticLogLevel,
  type DiagnosticLogger,
} from "./diagnostic-logger.js";
