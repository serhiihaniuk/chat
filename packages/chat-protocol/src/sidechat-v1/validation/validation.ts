import { ProtocolValidationError } from "../errors.js";
import { isRecord } from "../primitives.js";
import { SIDECHAT_PROTOCOL_VERSION } from "../version.js";
import { SIDECHAT_EVENT_TYPES, type SidechatStreamEvent } from "../events/event-union.js";
import { toBrandedSidechatEvent } from "./sidechat-event-branding.js";

const eventTypes = new Set<string>(Object.values(SIDECHAT_EVENT_TYPES));

/**
 * Validate one event received from or sent to a browser stream.
 *
 * Only declared sidechat.v1 fields are accepted. Server-only objects such as
 * database rows, HTTP objects, or runtime events do not belong in this payload.
 */
export const parseSidechatStreamEvent = (input: unknown): SidechatStreamEvent => {
  try {
    const event = parseEventEnvelope(input);
    validatePayload(event);
    return toBrandedSidechatEvent(event);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid event";
    throw new ProtocolValidationError(message);
  }
};

const parseEventEnvelope = (input: unknown): Record<string, unknown> => {
  if (!isRecord(input)) throw new Error("event must be an object");
  if (input["protocolVersion"] !== SIDECHAT_PROTOCOL_VERSION) {
    throw new Error(`event["protocolVersion"] must be ${SIDECHAT_PROTOCOL_VERSION}`);
  }

  const type = input["type"];
  if (typeof type !== "string" || !eventTypes.has(type)) {
    throw new Error('event["type"] is not a sidechat.v1 event');
  }
  requireString(input["eventId"], 'event["eventId"]');
  requireString(input["assistantTurnId"], 'event["assistantTurnId"]');
  requireNonNegativeInteger(input["sequence"], 'event["sequence"]');
  requireString(input["createdAt"], 'event["createdAt"]');
  return input;
};

const validatePayload = (event: Record<string, unknown>): void => {
  switch (event["type"]) {
    case SIDECHAT_EVENT_TYPES.STARTED:
      return;
    case SIDECHAT_EVENT_TYPES.DELTA:
      requireString(event["content"], 'event["content"]');
      return;
    case SIDECHAT_EVENT_TYPES.ACTIVITY:
      validateActivityPayload(event);
      return;
    case SIDECHAT_EVENT_TYPES.COMPLETED:
      requireOneOf(event["finishReason"], ["stop", "length", "aborted"], 'event["finishReason"]');
      return;
    case SIDECHAT_EVENT_TYPES.ERROR:
      requireString(event["code"], 'event["code"]');
      requireString(event["message"], 'event["message"]');
      if (typeof event["retryable"] !== "boolean") {
        throw new Error('event["retryable"] must be boolean');
      }
      return;
    case SIDECHAT_EVENT_TYPES.HISTORY:
      if (!Array.isArray(event["messages"])) {
        throw new Error('event["messages"] must be an array');
      }
      return;
  }
};

const validateActivityPayload = (event: Record<string, unknown>): void => {
  requireString(event["activityId"], 'event["activityId"]');
  requireOneOf(
    event["activityKind"],
    ["progress", "reasoning", "tool", "host_command"],
    'event["activityKind"]',
  );
  requireOneOf(event["status"], ["running", "completed", "failed"], 'event["status"]');
  requireString(event["title"], 'event["title"]');
  if (event["body"] !== undefined) requireString(event["body"], 'event["body"]');
  if (event["details"] !== undefined) validateActivityDetails(event["details"]);
};

const requireString = (value: unknown, label: string): void => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const requireOneOf = (value: unknown, allowed: readonly string[], label: string): void => {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} has unsupported value`);
  }
};

const requireNonNegativeInteger = (value: unknown, label: string): void => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
};

const validateActivityDetails = (value: unknown): void => {
  if (!isRecord(value)) throw new Error('event["details"] must be an object');
  requireKnownKeys(value, ["sources", "images", "tool", "hostCommand"], 'event["details"]');

  if (value["sources"] !== undefined) {
    validateArray(value["sources"], 'event["details"]["sources"]', validateActivitySource);
  }
  if (value["images"] !== undefined) {
    validateArray(value["images"], 'event["details"]["images"]', validateActivityImage);
  }
  if (value["tool"] !== undefined) validateActivityToolDetails(value["tool"]);
  if (value["hostCommand"] !== undefined) validateHostCommandDetails(value["hostCommand"]);
};

const validateActivitySource = (value: unknown): void => {
  if (!isRecord(value)) throw new Error("activity source must be an object");
  requireKnownKeys(value, ["label", "url"], "activity source");
  requireString(value["label"], 'activity source["label"]');
  if (value["url"] !== undefined) requireString(value["url"], 'activity source["url"]');
};

const validateActivityImage = (value: unknown): void => {
  if (!isRecord(value)) throw new Error("activity image must be an object");
  requireKnownKeys(value, ["alt", "caption", "mediaType", "data"], "activity image");
  requireString(value["alt"], 'activity image["alt"]');
  requireString(value["mediaType"], 'activity image["mediaType"]');
  requireString(value["data"], 'activity image["data"]');
  if (value["caption"] !== undefined) requireString(value["caption"], 'activity image["caption"]');
};

const validateActivityToolDetails = (value: unknown): void => {
  if (!isRecord(value)) throw new Error('event["details"]["tool"] must be an object');
  requireKnownKeys(
    value,
    ["toolCallId", "toolName", "input", "result", "sources", "errorCode"],
    'event["details"]["tool"]',
  );
  requireString(value["toolCallId"], 'event["details"]["tool"]["toolCallId"]');
  requireString(value["toolName"], 'event["details"]["tool"]["toolName"]');
  if (value["input"] !== undefined)
    requireJsonObject(value["input"], 'event["details"]["tool"]["input"]');
  if (value["result"] !== undefined)
    requireJsonObject(value["result"], 'event["details"]["tool"]["result"]');
  if (value["sources"] !== undefined) {
    validateArray(value["sources"], 'event["details"]["tool"]["sources"]', validateActivitySource);
  }
  if (value["errorCode"] !== undefined) {
    requireString(value["errorCode"], 'event["details"]["tool"]["errorCode"]');
  }
};

const validateHostCommandDetails = (value: unknown): void => {
  if (!isRecord(value)) throw new Error('event["details"]["hostCommand"] must be an object');
  requireKnownKeys(
    value,
    ["commandId", "commandName", "payload", "result"],
    'event["details"]["hostCommand"]',
  );
  requireString(value["commandId"], 'event["details"]["hostCommand"]["commandId"]');
  requireString(value["commandName"], 'event["details"]["hostCommand"]["commandName"]');
  requireJsonObject(value["payload"], 'event["details"]["hostCommand"]["payload"]');
  if (value["result"] !== undefined) {
    requireJsonObject(value["result"], 'event["details"]["hostCommand"]["result"]');
  }
};

const validateArray = (
  value: unknown,
  label: string,
  validateItem: (value: unknown) => void,
): void => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  for (const item of value) validateItem(item);
};

const requireKnownKeys = (
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void => {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) throw new Error(`${label} has unsupported field "${key}"`);
  }
};

const requireJsonObject = (value: unknown, label: string): void => {
  if (!isRecord(value) || !isJsonValue(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
};

const isJsonValue = (value: unknown): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
};
