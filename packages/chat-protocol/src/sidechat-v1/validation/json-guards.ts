import { ProtocolValidationError } from "../errors.js";
import { isRecord, type JsonObject, type JsonValue } from "../primitives.js";

/**
 * The one set of JSON-shape guards inside `sidechat.v1`.
 *
 * Source is untrusted wire input (a request body or an SSE payload); target is
 * the protocol's `JsonObject`/`JsonValue` contract. Both the event validator and
 * the request parser read through these, so "what counts as protocol-safe JSON"
 * (finite numbers, no functions, no class instances) is defined exactly once and
 * cannot drift between the two parse paths.
 */

export const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
};

export const isJsonObject = (value: unknown): value is JsonObject =>
  isRecord(value) && Object.values(value).every(isJsonValue);

/**
 * Reject any field outside the declared shape.
 *
 * Closed shapes are how server-only objects (DB rows, HTTP objects, provider
 * DTOs) are kept out of the public protocol: an extra key is an error, never
 * silently passed through.
 */
export const requireKnownKeys = (
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void => {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new ProtocolValidationError(`${label} has unsupported field "${key}"`);
    }
  }
};
