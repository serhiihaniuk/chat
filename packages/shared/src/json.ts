/** JSON values that are safe to place on Side Chat protocol payloads. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export type JsonObject = { readonly [key: string]: JsonValue };

/** Narrow unknown values to keyed object records; arrays remain distinct. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Narrow to a keyed object record, or `undefined` when the value is not one. */
export const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

/** Parse JSON only when its root is a keyed object. */
export const parseJsonRecord = (source: string): Record<string, unknown> | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return undefined;
  }
  return isRecord(parsed) ? parsed : undefined;
};

/**
 * Turn unknown input into a JSON object.
 *
 * Undefined fields are omitted. Unsupported scalar values and non-finite
 * numbers become null; bigints and symbols use their safe string form. A
 * scalar root is wrapped as `{ value }` so callers always receive an object.
 */
export const toJsonObject = (value: unknown): JsonObject => {
  if (!isRecord(value)) return { value: toJsonValue(value) };

  const json: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) json[key] = toJsonValue(entry);
  }
  return json;
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

/** Shallowly omit undefined fields whose remaining values are already JSON-safe. */
export const compactJsonObject = (
  value: Readonly<Record<string, JsonValue | undefined>>,
): JsonObject => {
  const json: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) json[key] = entry;
  }
  return json;
};
