/**
 * JSON values that are safe to place on Side Chat protocol payloads.
 *
 * Shared packages use this type at serialization boundaries so adapters,
 * clients, and widgets agree on the same JSON surface without depending on the
 * protocol package.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
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
 * Normalize unknown input into a protocol-safe JSON object.
 *
 * This is meant for adapter boundaries where provider/tool libraries may return
 * values outside JSON. Undefined fields are omitted, non-finite numbers become
 * null, bigint and symbol values become stable strings when possible, and scalar
 * roots are wrapped under `value` so downstream contracts always receive an
 * object.
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
