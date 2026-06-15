import type { JsonObject, JsonPrimitive, JsonValue } from "@side-chat/shared";
import { Effect } from "effect";

/**
 * Secret-safe stream-chat observability contract.
 *
 * Each stream-chat lifecycle fact becomes an `ObservabilityRecord` before it
 * leaves core. Records may identify request/trace ids, latency, lifecycle state,
 * assistant turn id, provider/model ids, and redacted attributes; raw messages,
 * prompts, retrieved content, memory records, tool payloads, provider options,
 * credentials, and protocol bodies must not cross this port.
 */

/** Correlation fields available before a durable assistant turn exists. */
export type TraceCorrelationInput = {
  readonly requestId: string;
  readonly traceId?: string;
};

/** Stable ids used to connect logs, persisted turn records, and stream events. */
export type RequestCorrelation = {
  readonly requestId: string;
  readonly traceId: string;
};

export type ObservabilityLifecycleState =
  | "received"
  | "started"
  | "runtime_event"
  | "completed"
  | "failed";

/**
 * Redacted lifecycle observation for one stream-chat turn.
 *
 * Core receives each lifecycle observation as this telemetry-safe record before
 * calling the sink. The record may identify lifecycle state and selected
 * provider/model ids; model-visible text and raw adapter/provider errors must
 * already be removed or redacted.
 */
export type ObservabilityRecord = RequestCorrelation & {
  readonly lifecycleState: ObservabilityLifecycleState;
  readonly assistantTurnId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly latencyMs: number;
  readonly errorCode?: string;
  readonly attributes: JsonObject;
};

/** Telemetry adapter supplied by service composition. */
export type ObservabilitySinkPort = {
  readonly record: (record: ObservabilityRecord) => Effect.Effect<void, unknown>;
};

/**
 * Explicit no-op sink for compositions that do not install telemetry yet.
 *
 * The stream-chat workflow can stay Effect-native without forcing every local
 * test or development route to invent an observability adapter. Production can
 * replace this with a real sink at the Layer boundary.
 */
export const NOOP_OBSERVABILITY_SINK: ObservabilitySinkPort = {
  record: () => Effect.succeed(undefined),
};

// Redaction is key-based only: lowercase substring matching, repeated through
// objects and arrays. It blocks obvious secret/content fields, but it does not
// understand every sensitive value a caller might put under a harmless key.
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

export const createRequestCorrelation = (input: TraceCorrelationInput): RequestCorrelation => ({
  requestId: input.requestId,
  traceId: input.traceId ?? `trace_${input.requestId}`,
});

/**
 * Remove obvious sensitive fields before data leaves core telemetry code.
 *
 * Redaction is key-based and recursive. Callers should still avoid putting
 * private values under harmless-looking keys because this is a safety net, not
 * a semantic data-loss-prevention engine.
 */
export const redactAttributes = (attributes: JsonObject): JsonObject => redactObject(attributes);

/**
 * Normalize unknown values into JSON primitives for diagnostic attributes.
 *
 * Complex objects are intentionally collapsed so accidental provider, tool,
 * memory, or protocol payloads cannot slip through as structured telemetry.
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
