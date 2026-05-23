import { ProtocolValidationError } from "./errors.js";
import { isRecord } from "./primitives.js";
import { SIDECHAT_PROTOCOL_VERSION } from "./version.js";
import {
  SIDECHAT_EVENT_TYPES,
  type SidechatStreamEvent,
} from "./events/event-union.js";

const eventTypes = new Set<string>(Object.values(SIDECHAT_EVENT_TYPES));

export const parseSidechatStreamEvent = (
  input: unknown,
): SidechatStreamEvent => {
  try {
    const event = parseEventEnvelope(input);
    validatePayload(event);
    return event as SidechatStreamEvent;
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid event";
    throw new ProtocolValidationError(message);
  }
};

const parseEventEnvelope = (input: unknown): Record<string, unknown> => {
  if (!isRecord(input)) throw new Error("event must be an object");
  if (input["protocolVersion"] !== SIDECHAT_PROTOCOL_VERSION) {
    throw new Error(
      `event["protocolVersion"] must be ${SIDECHAT_PROTOCOL_VERSION}`,
    );
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
    case SIDECHAT_EVENT_TYPES.started:
      return;
    case SIDECHAT_EVENT_TYPES.delta:
      requireString(event["content"], 'event["content"]');
      return;
    case SIDECHAT_EVENT_TYPES.reasoning:
      requireString(event["summary"], 'event["summary"]');
      return;
    case SIDECHAT_EVENT_TYPES.tool:
      requireString(event["toolCallId"], 'event["toolCallId"]');
      requireString(event["toolName"], 'event["toolName"]');
      requireOneOf(
        event["status"],
        ["started", "completed", "failed"],
        'event["status"]',
      );
      return;
    case SIDECHAT_EVENT_TYPES.hostCommand:
      requireString(event["commandId"], 'event["commandId"]');
      requireString(event["commandName"], 'event["commandName"]');
      if (!isRecord(event["payload"]))
        throw new Error('event["payload"] must be an object');
      return;
    case SIDECHAT_EVENT_TYPES.completed:
      requireOneOf(
        event["finishReason"],
        ["stop", "length", "aborted"],
        'event["finishReason"]',
      );
      return;
    case SIDECHAT_EVENT_TYPES.error:
      requireString(event["code"], 'event["code"]');
      requireString(event["message"], 'event["message"]');
      if (typeof event["retryable"] !== "boolean") {
        throw new Error('event["retryable"] must be boolean');
      }
      return;
    case SIDECHAT_EVENT_TYPES.history:
      if (!Array.isArray(event["messages"])) {
        throw new Error('event["messages"] must be an array');
      }
      return;
  }
};

const requireString = (value: unknown, label: string): void => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
};

const requireOneOf = (
  value: unknown,
  allowed: readonly string[],
  label: string,
): void => {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} has unsupported value`);
  }
};

const requireNonNegativeInteger = (value: unknown, label: string): void => {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
};
