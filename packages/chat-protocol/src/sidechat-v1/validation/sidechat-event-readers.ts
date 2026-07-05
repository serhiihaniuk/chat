import {
  PROTOCOL_ERROR_CODES,
  ProtocolValidationError,
  type ProtocolErrorCode,
} from "../errors.js";
import { isRecord, type JsonObject } from "../primitives.js";
import {
  ACTIVITY_KINDS,
  ACTIVITY_STATUSES,
  SIDECHAT_BLOCKED_REASONS,
  SIDECHAT_EVENT_TYPES,
  type ActivityKind,
  type ActivityStatus,
  type SidechatBlockedReason,
  type SidechatEventType,
} from "../events/event-union.js";

const PROTOCOL_ERROR_CODE_VALUES: readonly unknown[] = Object.values(PROTOCOL_ERROR_CODES);

export const readRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) throw new ProtocolValidationError(`${label} must be an object`);
  return value;
};

export const readString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProtocolValidationError(`${label} must be a non-empty string`);
  }
  return value;
};

export const readBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== "boolean") throw new ProtocolValidationError(`${label} must be boolean`);
  return value;
};

export const readNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProtocolValidationError(`${label} must be a finite number`);
  }
  return value;
};

export const readNonNegativeInteger = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProtocolValidationError(`${label} must be a non-negative integer`);
  }
  return value;
};

export const readOptionalNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export const readArray = <Item>(
  value: unknown,
  mapItem: (item: unknown) => Item,
): readonly Item[] => {
  if (!Array.isArray(value)) throw new ProtocolValidationError("value must be an array");
  return value.map(mapItem);
};

export const readOptionalArray = <Item>(
  value: unknown,
  mapItem: (item: unknown) => Item,
): readonly Item[] | undefined => (Array.isArray(value) ? value.map(mapItem) : undefined);

export const readJsonObject = (value: unknown, label: string): JsonObject => {
  if (!isJsonObject(value)) throw new ProtocolValidationError(`${label} must be a JSON object`);
  return value;
};

export const readOptionalJsonObject = (value: unknown): JsonObject | undefined =>
  isJsonObject(value) ? value : undefined;

const isJsonObject = (value: unknown): value is JsonObject =>
  isRecord(value) && Object.values(value).every(isJsonValue);

const isJsonValue = (value: unknown): value is JsonObject[keyof JsonObject] => {
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

export const readEventType = (value: unknown): SidechatEventType => {
  switch (value) {
    case SIDECHAT_EVENT_TYPES.STARTED:
    case SIDECHAT_EVENT_TYPES.DELTA:
    case SIDECHAT_EVENT_TYPES.ACTIVITY:
    case SIDECHAT_EVENT_TYPES.COMPLETED:
    case SIDECHAT_EVENT_TYPES.ERROR:
    case SIDECHAT_EVENT_TYPES.BLOCKED:
      return value;
    default:
      throw new ProtocolValidationError('event["type"] is not a sidechat.v1 event');
  }
};

export const readBlockedReason = (value: unknown): SidechatBlockedReason => {
  switch (value) {
    case SIDECHAT_BLOCKED_REASONS.CONTENT_FILTER:
    case SIDECHAT_BLOCKED_REASONS.SAFETY_POLICY:
      return value;
    default:
      throw new ProtocolValidationError('event["reason"] has unsupported value');
  }
};

export const readActivityKind = (value: unknown): ActivityKind => {
  switch (value) {
    case ACTIVITY_KINDS.PROGRESS:
    case ACTIVITY_KINDS.REASONING:
    case ACTIVITY_KINDS.TOOL:
    case ACTIVITY_KINDS.HOST_COMMAND:
      return value;
    default:
      throw new ProtocolValidationError('event["activityKind"] has unsupported value');
  }
};

export const readActivityStatus = (value: unknown): ActivityStatus => {
  switch (value) {
    case ACTIVITY_STATUSES.RUNNING:
    case ACTIVITY_STATUSES.COMPLETED:
    case ACTIVITY_STATUSES.FAILED:
      return value;
    default:
      throw new ProtocolValidationError('event["status"] has unsupported value');
  }
};

export const readFinishReason = (value: unknown): "stop" | "length" | "aborted" => {
  switch (value) {
    case "stop":
    case "length":
    case "aborted":
      return value;
    default:
      throw new ProtocolValidationError('event["finishReason"] has unsupported value');
  }
};

export const readProtocolErrorCode = (value: unknown): ProtocolErrorCode => {
  if (isProtocolErrorCode(value)) return value;
  throw new ProtocolValidationError('event["code"] has unsupported value');
};

export const readOptionalProtocolErrorCode = (value: unknown): ProtocolErrorCode | undefined =>
  value === undefined ? undefined : readProtocolErrorCode(value);

const isProtocolErrorCode = (value: unknown): value is ProtocolErrorCode =>
  PROTOCOL_ERROR_CODE_VALUES.includes(value);
