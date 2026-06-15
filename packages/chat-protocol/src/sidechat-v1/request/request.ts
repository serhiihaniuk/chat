import { ProtocolValidationError } from "../errors.js";
import { optionalField } from "@side-chat/shared";
import {
  assertProtocolVersion,
  isRecord,
  readString,
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
    const assistantProfileId = readString(input, "assistantProfileId");
    const hostContext = parseHostContext(input["hostContext"]);

    return {
      protocolVersion,
      requestId,
      ...optionalField("conversationId", conversationId),
      ...optionalField("assistantProfileId", assistantProfileId),
      message,
      ...optionalField("hostContext", hostContext),
    };
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
  const conversationId = readString(input, "conversationId");
  return conversationId ? toConversationId(conversationId) : undefined;
};

// Host context is optional page metadata from the browser. It helps explain
// where the message came from, but it is not proof of user or workspace access.
const parseHostContext = (input: unknown): HostContext | undefined => {
  if (input === undefined) return undefined;
  if (!isRecord(input)) throw new Error("request.hostContext must be an object");
  const schemaVersion = requireString(input, "schemaVersion", "request.hostContext");
  const origin = readString(input, "origin");
  const url = readString(input, "url");
  const title = readString(input, "title");
  const metadata = isRecord(input["metadata"]) ? (input["metadata"] as JsonObject) : undefined;
  return {
    schemaVersion,
    ...optionalField("origin", origin),
    ...optionalField("url", url),
    ...optionalField("title", title),
    ...optionalField("metadata", metadata),
  };
};
