import type { JsonObject, JsonPrimitive, JsonValue } from "./index.js";

/**
 * Key-based recursive redaction for anything about to reach a log or telemetry sink.
 *
 * This is the one redaction implementation in the repo. It lives in `shared`
 * (zero-dep) so the diagnostic logger, core telemetry, and any adapter apply the
 * exact same safety net before data becomes observable. Redaction is key-based:
 * lowercase substring matching, repeated through objects and arrays. It blocks
 * obvious secret/content fields, but it does not understand every sensitive value
 * a caller might place under a harmless key — treat it as a safety net, not a
 * data-loss-prevention engine, and avoid putting private values under bland keys.
 */
const SENSITIVE_KEY_PARTS = [
  "authorization",
  "bearer",
  "token",
  "secret",
  "password",
  "credential",
  "apikey",
  "prompt",
  "message",
  "messages",
  "content",
  "argumentsJson",
  "resultJson",
  "result",
  "details",
  "sources",
  "data",
  "input",
  "output",
  "payload",
] as const;

const REDACTED = "[redacted]";

/**
 * Remove obvious sensitive fields before data leaves telemetry or log code.
 *
 * Redaction is key-based and recursive; a matched key's whole value is replaced,
 * never masked in part.
 */
export const redactAttributes = (attributes: JsonObject): JsonObject => redactObject(attributes);

/**
 * Normalize an unknown value into a JSON primitive for a diagnostic attribute.
 *
 * Complex objects collapse to a marker so an accidental private payload cannot
 * slip through as structured telemetry.
 */
export const safeJsonPrimitive = (value: unknown): JsonPrimitive => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "symbol";
  return "non_primitive";
};

const redactObject = (source: JsonObject): JsonObject => {
  const redacted: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(source)) {
    redacted[key] = isSensitiveKey(key) ? REDACTED : redactJsonValue(value);
  }
  return redacted;
};

const redactJsonValue = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(redactJsonValue);
  if (isJsonObject(value)) return redactObject(value);
  return value;
};

const isJsonObject = (value: JsonValue): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSensitiveKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part.toLowerCase()));
};
