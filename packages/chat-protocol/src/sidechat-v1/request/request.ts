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

/**
 * User-authored content submitted by the browser to start one assistant turn.
 *
 * The browser does not supply a role for the current message. Server-side
 * packages assign `user` when persisting the message and when building the
 * model-visible runtime request.
 */
export type ChatRequestMessage = {
  readonly id: MessageId;
  readonly content: string;
};

/**
 * Browser-provided page metadata attached to a request.
 *
 * Host context can explain where the user submitted the message, but it is
 * reference data only. It is not proof of identity, workspace access, or
 * trusted instruction text.
 */
export type HostContext = {
  readonly schemaVersion: string;
  readonly origin?: string;
  readonly url?: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
};

/**
 * Browser request for one Side Chat user turn.
 *
 * This is the public `sidechat.v1` request contract. Auth, policy, persistence,
 * role assignment, system instructions, tools, and model choices are added by
 * server-side packages after this DTO is parsed.
 */
export type ChatStreamRequest = ProtocolEnvelope & {
  readonly requestId: RequestId;
  readonly conversationId?: ConversationId;
  readonly assistantProfileId?: string;
  readonly message: ChatRequestMessage;
  readonly hostContext?: HostContext;
};

const REQUEST_FIELDS = [
  "protocolVersion",
  "requestId",
  "conversationId",
  "assistantProfileId",
  "message",
  "hostContext",
] as const;
const MESSAGE_FIELDS = ["id", "content"] as const;
const HOST_CONTEXT_FIELDS = ["schemaVersion", "origin", "url", "title", "metadata"] as const;

/**
 * Validate the browser request for a new assistant turn.
 *
 * The result is still only user message data. Auth, persistence, and model
 * choices are added later by server-side packages.
 */
export const parseChatStreamRequest = (input: unknown): ChatStreamRequest => {
  try {
    if (!isRecord(input)) throw new Error("request must be an object");
    requireKnownKeys(input, REQUEST_FIELDS, "request");
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
  requireKnownKeys(input, MESSAGE_FIELDS, "request.message");
  const id = toMessageId(requireString(input, "id", "request.message"));
  const content = requireString(input, "content", "request.message");
  return { id, content };
};

const readOptionalConversationId = (input: Record<string, unknown>): ConversationId | undefined => {
  const conversationId = readOptionalString(input, "conversationId", "request");
  return conversationId === undefined ? undefined : toConversationId(conversationId);
};

const parseOptionalHostContext = (input: Record<string, unknown>): HostContext | undefined => {
  if (!Object.hasOwn(input, "hostContext")) return undefined;
  return parseHostContext(input["hostContext"]);
};

const parseHostContext = (input: unknown): HostContext | undefined => {
  if (!isRecord(input)) throw new Error("request.hostContext must be an object");
  requireKnownKeys(input, HOST_CONTEXT_FIELDS, "request.hostContext");
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

const requireKnownKeys = (
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void => {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) throw new Error(`${label} has unsupported field "${key}"`);
  }
};
