import { ProtocolValidationError } from "../errors.js";
import { omitUndefinedProperties } from "@side-chat/shared";
import {
  assertProtocolVersion,
  isRecord,
  requireString,
  toConversationId,
  toMessageId,
  toRequestId,
  type JsonObject,
  type ConversationId,
  type MessageId,
  type ProtocolEnvelope,
  type RequestId,
} from "../primitives.js";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatRequestMessage = {
  readonly id: MessageId;
  readonly role: ChatMessageRole;
  readonly content: string;
};

export type HostContext = {
  readonly schemaVersion: string;
  readonly origin?: string;
  readonly url?: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
};

export type ChatStreamRequest = ProtocolEnvelope & {
  readonly requestId: RequestId;
  readonly conversationId?: ConversationId;
  readonly assistantProfileId?: string;
  readonly message: ChatRequestMessage;
  readonly hostContext?: HostContext;
};

const messageRoles = new Set<ChatMessageRole>(["user", "assistant", "system"]);

/**
 * Validate the browser request for a new assistant turn.
 *
 * The result is still only user message data. Auth, persistence, and model
 * choices are added later by server-side packages.
 */
export const parseChatStreamRequest = (input: unknown): ChatStreamRequest => {
  try {
    if (!isRecord(input)) throw new Error("request must be an object");
    const protocolVersion = assertProtocolVersion(input["protocolVersion"], "request");
    const requestId = toRequestId(requireString(input, "requestId", "request"));
    const message = parseMessage(input["message"]);
    const conversationId = readOptionalConversationId(input);
    const assistantProfileId = readOptionalString(input, "assistantProfileId", "request");
    const hostContext = parseOptionalHostContext(input);

    return omitUndefinedProperties({
      protocolVersion,
      requestId,
      conversationId,
      assistantProfileId,
      message,
      hostContext,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    throw new ProtocolValidationError(message);
  }
};

const parseMessage = (input: unknown): ChatRequestMessage => {
  if (!isRecord(input)) throw new Error("request.message must be an object");
  const id = toMessageId(requireString(input, "id", "request.message"));
  const content = requireString(input, "content", "request.message");
  const role = input["role"];
  if (typeof role !== "string" || !messageRoles.has(role as ChatMessageRole)) {
    throw new Error("request.message.role must be user, assistant, or system");
  }
  return { id, role: role as ChatMessageRole, content };
};

const readOptionalConversationId = (input: Record<string, unknown>): ConversationId | undefined => {
  const conversationId = readOptionalString(input, "conversationId", "request");
  return conversationId === undefined ? undefined : toConversationId(conversationId);
};

// Host context is optional page metadata from the browser. It helps explain
// where the message came from, but it is not proof of user or workspace access.
const parseOptionalHostContext = (input: Record<string, unknown>): HostContext | undefined => {
  if (!Object.hasOwn(input, "hostContext")) return undefined;
  return parseHostContext(input["hostContext"]);
};

const parseHostContext = (input: unknown): HostContext | undefined => {
  if (!isRecord(input)) throw new Error("request.hostContext must be an object");
  const schemaVersion = requireString(input, "schemaVersion", "request.hostContext");
  const origin = readOptionalString(input, "origin", "request.hostContext");
  const url = readOptionalString(input, "url", "request.hostContext");
  const title = readOptionalString(input, "title", "request.hostContext");
  const metadata = readOptionalJsonObject(input, "metadata", "request.hostContext");
  return omitUndefinedProperties({
    schemaVersion,
    origin,
    url,
    title,
    metadata,
  });
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined => {
  if (!Object.hasOwn(record, key)) return undefined;
  return requireString(record, key, context);
};

const readOptionalJsonObject = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): JsonObject | undefined => {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (!isJsonObject(value)) throw new Error(`${context}.${key} must be a JSON object`);
  return value;
};

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
