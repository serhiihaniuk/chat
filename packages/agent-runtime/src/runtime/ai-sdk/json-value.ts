import type { JsonObject, JsonValue } from "@side-chat/chat-protocol";

/**
 * Normalize unknown AI SDK tool input/output into protocol-safe JSON objects.
 *
 * Tool schemas should already constrain normal values, but this adapter is the
 * boundary between provider/tool libraries and Side Chat events. Undefined,
 * bigint, symbol, non-finite numbers, and scalar roots are normalized so tool
 * activity details stay serializable.
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
