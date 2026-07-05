import {
  isRecord,
  toActivityId,
  toAssistantTurnId,
  toConversationId,
  toEventId,
  toHostCommandId,
  toProtocolSequence,
  toToolCallId,
} from "../primitives.js";
import { SIDECHAT_PROTOCOL_VERSION } from "../version.js";
import {
  SIDECHAT_EVENT_TYPES,
  type ActivityDetails,
  type ActivityEvent,
  type ActivityHostCommandDetails,
  type ActivityImage,
  type ActivitySource,
  type ActivityToolDetails,
  type CompletedEvent,
  type SidechatEventBase,
  type SidechatStreamEvent,
  type StartedEvent,
  type UsageMetadata,
} from "../events/event-union.js";
import {
  readActivityKind,
  readActivityStatus,
  readBlockedReason,
  readBoolean,
  readEventType,
  readFinishReason,
  readJsonObject,
  readNonNegativeInteger,
  readOptionalArray,
  readOptionalJsonObject,
  readOptionalNumber,
  readOptionalProtocolErrorCode,
  readProtocolErrorCode,
  readRecord,
  readString,
} from "./sidechat-event-readers.js";

type Writable<T> = { -readonly [Key in keyof T]: T[Key] };

export const toBrandedSidechatEvent = (event: Record<string, unknown>): SidechatStreamEvent => {
  const base = toEventBase(event);

  switch (base.type) {
    case SIDECHAT_EVENT_TYPES.STARTED:
      return toStartedEvent(base, event);
    case SIDECHAT_EVENT_TYPES.DELTA:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.DELTA,
        content: readString(event["content"], 'event["content"]'),
      };
    case SIDECHAT_EVENT_TYPES.ACTIVITY:
      return toActivityEvent(base, event);
    case SIDECHAT_EVENT_TYPES.COMPLETED:
      return toCompletedEvent(base, event);
    case SIDECHAT_EVENT_TYPES.ERROR:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.ERROR,
        code: readProtocolErrorCode(event["code"]),
        message: readString(event["message"], 'event["message"]'),
        retryable: readBoolean(event["retryable"], 'event["retryable"]'),
      };
    case SIDECHAT_EVENT_TYPES.BLOCKED:
      return {
        ...base,
        type: SIDECHAT_EVENT_TYPES.BLOCKED,
        reason: readBlockedReason(event["reason"]),
        publicMessage: readString(event["publicMessage"], 'event["publicMessage"]'),
      };
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

const toStartedEvent = (base: SidechatEventBase, event: Record<string, unknown>): StartedEvent => {
  const startedEvent: Writable<StartedEvent> = {
    ...base,
    type: SIDECHAT_EVENT_TYPES.STARTED,
  };

  if (typeof event["conversationId"] === "string") {
    startedEvent.conversationId = toConversationId(event["conversationId"]);
  }

  return startedEvent;
};

const toActivityEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): ActivityEvent => {
  const activityEvent: Writable<ActivityEvent> = {
    ...base,
    type: SIDECHAT_EVENT_TYPES.ACTIVITY,
    activityId: toActivityId(readString(event["activityId"], 'event["activityId"]')),
    activityKind: readActivityKind(event["activityKind"]),
    status: readActivityStatus(event["status"]),
    title: readString(event["title"], 'event["title"]'),
  };

  if (typeof event["body"] === "string") activityEvent.body = event["body"];
  if (isRecord(event["details"])) activityEvent.details = toActivityDetails(event["details"]);

  return activityEvent;
};

const toActivityDetails = (details: Record<string, unknown>): ActivityDetails => {
  const sources = readOptionalArray(details["sources"], toActivitySource);
  const images = readOptionalArray(details["images"], toActivityImage);
  const tool = isRecord(details["tool"]) ? toActivityToolDetails(details["tool"]) : undefined;
  const hostCommand = isRecord(details["hostCommand"])
    ? toActivityHostCommandDetails(details["hostCommand"])
    : undefined;

  const activityDetails: Writable<ActivityDetails> = {};
  if (sources) activityDetails.sources = sources;
  if (images) activityDetails.images = images;
  if (tool) activityDetails.tool = tool;
  if (hostCommand) activityDetails.hostCommand = hostCommand;

  return activityDetails;
};

const toActivitySource = (value: unknown): ActivitySource => {
  const sourceRecord = readRecord(value, "activity source");
  const activitySource: Writable<ActivitySource> = {
    label: readString(sourceRecord["label"], 'activity source["label"]'),
  };
  const url = sourceRecord["url"];

  if (typeof url === "string") activitySource.url = url;

  return activitySource;
};

const toActivityImage = (value: unknown): ActivityImage => {
  const image = readRecord(value, "activity image");
  const caption = image["caption"];
  const activityImage: Writable<ActivityImage> = {
    alt: readString(image["alt"], 'activity image["alt"]'),
    mediaType: readString(image["mediaType"], 'activity image["mediaType"]'),
    data: readString(image["data"], 'activity image["data"]'),
  };

  if (typeof caption === "string") activityImage.caption = caption;

  return activityImage;
};

const toActivityToolDetails = (tool: Record<string, unknown>): ActivityToolDetails => {
  const input = readOptionalJsonObject(tool["input"]);
  const result = readOptionalJsonObject(tool["result"]);
  const sources = readOptionalArray(tool["sources"], toActivitySource);
  const errorCode = readOptionalProtocolErrorCode(tool["errorCode"]);

  const toolDetails: Writable<ActivityToolDetails> = {
    toolCallId: toToolCallId(
      readString(tool["toolCallId"], 'event["details"]["tool"]["toolCallId"]'),
    ),
    toolName: readString(tool["toolName"], 'event["details"]["tool"]["toolName"]'),
  };

  if (input) toolDetails.input = input;
  if (result) toolDetails.result = result;
  if (sources) toolDetails.sources = sources;
  if (errorCode) toolDetails.errorCode = errorCode;

  return toolDetails;
};

const toActivityHostCommandDetails = (
  command: Record<string, unknown>,
): ActivityHostCommandDetails => {
  const result = readOptionalJsonObject(command["result"]);

  const hostCommandDetails: Writable<ActivityHostCommandDetails> = {
    commandId: toHostCommandId(
      readString(command["commandId"], 'event["details"]["hostCommand"]["commandId"]'),
    ),
    commandName: readString(
      command["commandName"],
      'event["details"]["hostCommand"]["commandName"]',
    ),
    payload: readJsonObject(command["payload"], 'event["details"]["hostCommand"]["payload"]'),
  };

  if (result) hostCommandDetails.result = result;

  return hostCommandDetails;
};

const toUsageMetadata = (usage: Record<string, unknown>): UsageMetadata => {
  const inputTokens = readOptionalNumber(usage["inputTokens"]);
  const outputTokens = readOptionalNumber(usage["outputTokens"]);
  const totalTokens = readOptionalNumber(usage["totalTokens"]);

  const usageMetadata: Writable<UsageMetadata> = {};
  if (inputTokens !== undefined) usageMetadata.inputTokens = inputTokens;
  if (outputTokens !== undefined) usageMetadata.outputTokens = outputTokens;
  if (totalTokens !== undefined) usageMetadata.totalTokens = totalTokens;

  return usageMetadata;
};

const toCompletedEvent = (
  base: SidechatEventBase,
  event: Record<string, unknown>,
): CompletedEvent => {
  const completedEvent: Writable<CompletedEvent> = {
    ...base,
    type: SIDECHAT_EVENT_TYPES.COMPLETED,
    finishReason: readFinishReason(event["finishReason"]),
  };

  if (isRecord(event["usage"])) completedEvent.usage = toUsageMetadata(event["usage"]);

  return completedEvent;
};
