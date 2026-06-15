import { brandNumber, brandString, type Brand } from "@side-chat/shared";

export type { JsonObject, JsonPrimitive, JsonValue } from "@side-chat/shared";
export { isRecord } from "@side-chat/shared";

import { SIDECHAT_PROTOCOL_VERSION, type SidechatProtocolVersion } from "./version.js";

export type SidechatId = Brand<string, "SidechatId">;
export type RequestId = Brand<string, "RequestId">;
export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type AssistantTurnId = Brand<string, "AssistantTurnId">;
export type EventId = Brand<string, "EventId">;
export type ActivityId = Brand<string, "ActivityId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type HostCommandId = Brand<string, "HostCommandId">;
export type ProtocolSequence = Brand<number, "ProtocolSequence">;

export const toSidechatId = (value: string): SidechatId => brandString<"SidechatId">(value);
export const toRequestId = (value: string): RequestId => brandString<"RequestId">(value);
export const toConversationId = (value: string): ConversationId =>
  brandString<"ConversationId">(value);
export const toMessageId = (value: string): MessageId => brandString<"MessageId">(value);
export const toAssistantTurnId = (value: string): AssistantTurnId =>
  brandString<"AssistantTurnId">(value);
export const toEventId = (value: string): EventId => brandString<"EventId">(value);
export const toActivityId = (value: string): ActivityId => brandString<"ActivityId">(value);
export const toToolCallId = (value: string): ToolCallId => brandString<"ToolCallId">(value);
export const toHostCommandId = (value: string): HostCommandId =>
  brandString<"HostCommandId">(value);
export const toProtocolSequence = (value: number): ProtocolSequence =>
  brandNumber<"ProtocolSequence">(value);

export type ProtocolEnvelope = {
  readonly protocolVersion: SidechatProtocolVersion;
};

export const readString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const requireString = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): string => {
  const value = readString(record, key);
  if (!value) throw new Error(`${context}.${key} must be a non-empty string`);
  return value;
};

export const assertProtocolVersion = (value: unknown, context: string): SidechatProtocolVersion => {
  if (value !== SIDECHAT_PROTOCOL_VERSION) {
    throw new Error(`${context}.protocolVersion must be ${SIDECHAT_PROTOCOL_VERSION}`);
  }
  return SIDECHAT_PROTOCOL_VERSION;
};
