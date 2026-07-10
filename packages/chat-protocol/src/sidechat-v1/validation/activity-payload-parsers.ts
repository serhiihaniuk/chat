import { toHostCommandId, toToolCallId } from "../primitives.js";
import type {
  ActivityDetails,
  ActivityHostCommandDetails,
  ActivityImage,
  ActivitySource,
  ActivityToolDetails,
  UsageMetadata,
} from "../events/event-union.js";
import { requireKnownKeys } from "./json-guards.js";
import {
  readJsonObject,
  readOptionalArray,
  readOptionalJsonObject,
  readOptionalNonNegativeInteger,
  readOptionalProtocolErrorCode,
  readOptionalString,
  readRecord,
  readString,
} from "./sidechat-event-readers.js";

/**
 * Single-pass parsers for the nested payloads of `sidechat.activity` and
 * `sidechat.completed`.
 *
 * Source is one already-envelope-checked wire record; target is the typed,
 * branded detail object. Same closed-shape rule as the event parsers: every
 * sub-object rejects unknown keys, and a present-but-wrong-typed optional is a
 * protocol error, never silently dropped.
 */

type Writable<T> = { -readonly [Key in keyof T]: T[Key] };

export const parseActivityDetails = (details: Record<string, unknown>): ActivityDetails => {
  requireKnownKeys(details, ["sources", "images", "tool", "hostCommand"], 'event["details"]');
  const sources = readOptionalArray(
    details["sources"],
    'event["details"]["sources"]',
    parseActivitySource,
  );
  const images = readOptionalArray(
    details["images"],
    'event["details"]["images"]',
    parseActivityImage,
  );

  const activityDetails: Writable<ActivityDetails> = {};
  if (sources !== undefined) activityDetails.sources = sources;
  if (images !== undefined) activityDetails.images = images;
  if (details["tool"] !== undefined) {
    activityDetails.tool = parseActivityToolDetails(
      readRecord(details["tool"], 'event["details"]["tool"]'),
    );
  }
  if (details["hostCommand"] !== undefined) {
    activityDetails.hostCommand = parseActivityHostCommandDetails(
      readRecord(details["hostCommand"], 'event["details"]["hostCommand"]'),
    );
  }
  return activityDetails;
};

export const parseUsageMetadata = (usage: Record<string, unknown>): UsageMetadata => {
  requireKnownKeys(usage, ["inputTokens", "outputTokens", "totalTokens"], 'event["usage"]');
  const inputTokens = readOptionalNonNegativeInteger(
    usage["inputTokens"],
    'event["usage"]["inputTokens"]',
  );
  const outputTokens = readOptionalNonNegativeInteger(
    usage["outputTokens"],
    'event["usage"]["outputTokens"]',
  );
  const totalTokens = readOptionalNonNegativeInteger(
    usage["totalTokens"],
    'event["usage"]["totalTokens"]',
  );

  const usageMetadata: Writable<UsageMetadata> = {};
  if (inputTokens !== undefined) usageMetadata.inputTokens = inputTokens;
  if (outputTokens !== undefined) usageMetadata.outputTokens = outputTokens;
  if (totalTokens !== undefined) usageMetadata.totalTokens = totalTokens;
  return usageMetadata;
};

const parseActivitySource = (value: unknown): ActivitySource => {
  const source = readRecord(value, "activity source");
  requireKnownKeys(source, ["label", "url"], "activity source");
  const url = readOptionalString(source["url"], 'activity source["url"]');

  const activitySource: Writable<ActivitySource> = {
    label: readString(source["label"], 'activity source["label"]'),
  };
  if (url !== undefined) activitySource.url = url;
  return activitySource;
};

const parseActivityImage = (value: unknown): ActivityImage => {
  const image = readRecord(value, "activity image");
  requireKnownKeys(image, ["alt", "caption", "mediaType", "data"], "activity image");
  const caption = readOptionalString(image["caption"], 'activity image["caption"]');

  const activityImage: Writable<ActivityImage> = {
    alt: readString(image["alt"], 'activity image["alt"]'),
    mediaType: readString(image["mediaType"], 'activity image["mediaType"]'),
    data: readString(image["data"], 'activity image["data"]'),
  };
  if (caption !== undefined) activityImage.caption = caption;
  return activityImage;
};

const parseActivityToolDetails = (tool: Record<string, unknown>): ActivityToolDetails => {
  requireKnownKeys(
    tool,
    ["toolCallId", "toolName", "input", "result", "sources", "errorCode"],
    'event["details"]["tool"]',
  );
  const input = readOptionalJsonObject(tool["input"], 'event["details"]["tool"]["input"]');
  const result = readOptionalJsonObject(tool["result"], 'event["details"]["tool"]["result"]');
  const sources = readOptionalArray(
    tool["sources"],
    'event["details"]["tool"]["sources"]',
    parseActivitySource,
  );
  const errorCode = readOptionalProtocolErrorCode(
    tool["errorCode"],
    'event["details"]["tool"]["errorCode"]',
  );

  const toolDetails: Writable<ActivityToolDetails> = {
    toolCallId: toToolCallId(
      readString(tool["toolCallId"], 'event["details"]["tool"]["toolCallId"]'),
    ),
    toolName: readString(tool["toolName"], 'event["details"]["tool"]["toolName"]'),
  };
  if (input !== undefined) toolDetails.input = input;
  if (result !== undefined) toolDetails.result = result;
  if (sources !== undefined) toolDetails.sources = sources;
  if (errorCode !== undefined) toolDetails.errorCode = errorCode;
  return toolDetails;
};

const parseActivityHostCommandDetails = (
  command: Record<string, unknown>,
): ActivityHostCommandDetails => {
  requireKnownKeys(
    command,
    ["commandId", "commandName", "payload", "result"],
    'event["details"]["hostCommand"]',
  );
  const result = readOptionalJsonObject(
    command["result"],
    'event["details"]["hostCommand"]["result"]',
  );

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
  if (result !== undefined) hostCommandDetails.result = result;
  return hostCommandDetails;
};
