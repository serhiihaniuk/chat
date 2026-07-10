import { ProtocolValidationError } from "../errors.js";
import {
  isRecord,
  toActivityId,
  toAssistantTurnId,
  toConversationId,
  toEventId,
  toProtocolSequence,
} from "../primitives.js";
import { SIDECHAT_PROTOCOL_VERSION } from "../version.js";
import {
  SIDECHAT_EVENT_TYPES,
  type ActivityEvent,
  type CompletedEvent,
  type SidechatEventBase,
  type SidechatEventType,
  type SidechatStreamEvent,
  type StartedEvent,
} from "../events/event-union.js";
import { parseActivityDetails, parseUsageMetadata } from "./activity-payload-parsers.js";
import { requireKnownKeys } from "./json-guards.js";
import {
  readActivityKind,
  readActivityStatus,
  readBlockedReason,
  readBoolean,
  readEventType,
  readFinishReason,
  readNonNegativeInteger,
  readOptionalString,
  readProtocolErrorCode,
  readRecord,
  readString,
} from "./sidechat-event-readers.js";

/**
 * Single-pass parse of one event received from or sent to a browser stream.
 *
 * Each field is validated and constructed in the same read — there is no
 * separate validate-then-brand pass, so an event's shape is declared exactly
 * once (its field list plus its parser below). Only declared sidechat.v1 fields
 * are accepted. Server-only objects such as database rows, HTTP objects, or
 * runtime events do not belong in this payload.
 */

type Writable<T> = { -readonly [Key in keyof T]: T[Key] };

const BASE_EVENT_FIELDS = [
  "protocolVersion",
  "type",
  "eventId",
  "assistantTurnId",
  "sequence",
  "createdAt",
] as const;
const STARTED_EVENT_FIELDS = [...BASE_EVENT_FIELDS, "conversationId"] as const;
const DELTA_EVENT_FIELDS = [...BASE_EVENT_FIELDS, "content"] as const;
const ACTIVITY_EVENT_FIELDS = [
  ...BASE_EVENT_FIELDS,
  "activityId",
  "activityKind",
  "status",
  "title",
  "body",
  "details",
] as const;
const COMPLETED_EVENT_FIELDS = [...BASE_EVENT_FIELDS, "finishReason", "usage"] as const;
const ERROR_EVENT_FIELDS = [...BASE_EVENT_FIELDS, "code", "message", "retryable"] as const;
const BLOCKED_EVENT_FIELDS = [...BASE_EVENT_FIELDS, "reason", "publicMessage"] as const;

export const parseSidechatStreamEvent = (input: unknown): SidechatStreamEvent => {
  try {
    if (!isRecord(input)) throw new Error("event must be an object");
    if (input["protocolVersion"] !== SIDECHAT_PROTOCOL_VERSION) {
      throw new Error(`event["protocolVersion"] must be ${SIDECHAT_PROTOCOL_VERSION}`);
    }
    const base = toEventBase(input);
    return EVENT_PARSERS[base.type](base, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid event";
    throw new ProtocolValidationError(message);
  }
};

const toEventBase = (event: Record<string, unknown>): SidechatEventBase => ({
  protocolVersion: SIDECHAT_PROTOCOL_VERSION,
  type: readEventType(event["type"]),
  eventId: toEventId(readString(event["eventId"], 'event["eventId"]')),
  assistantTurnId: toAssistantTurnId(
    readString(event["assistantTurnId"], 'event["assistantTurnId"]'),
  ),
  sequence: toProtocolSequence(readNonNegativeInteger(event["sequence"], 'event["sequence"]')),
  createdAt: readString(event["createdAt"], 'event["createdAt"]'),
});

const parseStartedEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): StartedEvent => {
  requireKnownKeys(event, STARTED_EVENT_FIELDS, "sidechat.started event");
  const conversationId = readOptionalString(event["conversationId"], 'event["conversationId"]');

  const startedEvent: Writable<StartedEvent> = { ...base, type: SIDECHAT_EVENT_TYPES.STARTED };
  if (conversationId !== undefined) startedEvent.conversationId = toConversationId(conversationId);
  return startedEvent;
};

const parseDeltaEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): SidechatStreamEvent => {
  requireKnownKeys(event, DELTA_EVENT_FIELDS, "sidechat.delta event");
  return {
    ...base,
    type: SIDECHAT_EVENT_TYPES.DELTA,
    content: readString(event["content"], 'event["content"]'),
  };
};

const parseActivityEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): ActivityEvent => {
  requireKnownKeys(event, ACTIVITY_EVENT_FIELDS, "sidechat.activity event");
  const body = readOptionalString(event["body"], 'event["body"]');

  const activityEvent: Writable<ActivityEvent> = {
    ...base,
    type: SIDECHAT_EVENT_TYPES.ACTIVITY,
    activityId: toActivityId(readString(event["activityId"], 'event["activityId"]')),
    activityKind: readActivityKind(event["activityKind"]),
    status: readActivityStatus(event["status"]),
    title: readString(event["title"], 'event["title"]'),
  };
  if (body !== undefined) activityEvent.body = body;
  if (event["details"] !== undefined) {
    activityEvent.details = parseActivityDetails(readRecord(event["details"], 'event["details"]'));
  }
  return activityEvent;
};

const parseCompletedEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): CompletedEvent => {
  requireKnownKeys(event, COMPLETED_EVENT_FIELDS, "sidechat.completed event");

  const completedEvent: Writable<CompletedEvent> = {
    ...base,
    type: SIDECHAT_EVENT_TYPES.COMPLETED,
    finishReason: readFinishReason(event["finishReason"]),
  };
  if (event["usage"] !== undefined) {
    completedEvent.usage = parseUsageMetadata(readRecord(event["usage"], 'event["usage"]'));
  }
  return completedEvent;
};

const parseErrorEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): SidechatStreamEvent => {
  requireKnownKeys(event, ERROR_EVENT_FIELDS, "sidechat.error event");
  return {
    ...base,
    type: SIDECHAT_EVENT_TYPES.ERROR,
    code: readProtocolErrorCode(event["code"]),
    message: readString(event["message"], 'event["message"]'),
    retryable: readBoolean(event["retryable"], 'event["retryable"]'),
  };
};

const parseBlockedEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): SidechatStreamEvent => {
  requireKnownKeys(event, BLOCKED_EVENT_FIELDS, "sidechat.blocked event");
  return {
    ...base,
    type: SIDECHAT_EVENT_TYPES.BLOCKED,
    reason: readBlockedReason(event["reason"]),
    publicMessage: readString(event["publicMessage"], 'event["publicMessage"]'),
  };
};

// `satisfies Record<SidechatEventType, …>` is the completeness lock: adding an
// event to the union without a parser here fails to compile.
const EVENT_PARSERS = {
  [SIDECHAT_EVENT_TYPES.STARTED]: parseStartedEvent,
  [SIDECHAT_EVENT_TYPES.DELTA]: parseDeltaEvent,
  [SIDECHAT_EVENT_TYPES.ACTIVITY]: parseActivityEvent,
  [SIDECHAT_EVENT_TYPES.COMPLETED]: parseCompletedEvent,
  [SIDECHAT_EVENT_TYPES.ERROR]: parseErrorEvent,
  [SIDECHAT_EVENT_TYPES.BLOCKED]: parseBlockedEvent,
} satisfies Record<
  SidechatEventType,
  (base: SidechatEventBase, event: Record<string, unknown>) => SidechatStreamEvent
>;
