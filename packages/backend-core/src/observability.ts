import type {
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "@side-chat/chat-protocol";

export type TraceCorrelationInput = {
  readonly requestId: string;
  readonly traceId?: string;
};

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

export type ObservabilityRecord = RequestCorrelation & {
  readonly lifecycleState: ObservabilityLifecycleState;
  readonly assistantTurnId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly latencyMs: number;
  readonly errorCode?: string;
  readonly attributes: JsonObject;
};

export type ObservabilitySinkPort = {
  readonly record: (record: ObservabilityRecord) => void | Promise<void>;
};

const SENSITIVE_KEY_PARTS = [
  "authorization",
  "bearer",
  "token",
  "secret",
  "password",
  "credential",
  "apiKey",
  "apikey",
  "prompt",
  "message",
  "messages",
  "content",
  "argumentsJson",
  "resultJson",
  "input",
  "output",
  "payload",
] as const;

const REDACTED = "[redacted]";

export const createRequestCorrelation = (
  input: TraceCorrelationInput,
): RequestCorrelation => ({
  requestId: input.requestId,
  traceId: input.traceId ?? `trace_${input.requestId}`,
});

export const redactAttributes = (attributes: JsonObject): JsonObject =>
  redactObject(attributes);

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
  return SENSITIVE_KEY_PARTS.some((part) =>
    normalized.includes(part.toLowerCase()),
  );
};

export const safeJsonPrimitive = (value: unknown): JsonPrimitive => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.description ?? "symbol";
  return "non_primitive";
};
