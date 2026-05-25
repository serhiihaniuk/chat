import { ProtocolValidationError } from "./errors.js";
import {
  assertProtocolVersion,
  isRecord,
  readString,
  requireString,
  type JsonObject,
  type ProtocolEnvelope,
} from "./primitives.js";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatRequestMessage = {
  readonly id: string;
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
  readonly requestId: string;
  readonly conversationId?: string;
  readonly assistantProfileId?: string;
  readonly message: ChatRequestMessage;
  readonly hostContext?: HostContext;
};

const messageRoles = new Set<ChatMessageRole>(["user", "assistant", "system"]);

export const parseChatStreamRequest = (input: unknown): ChatStreamRequest => {
  try {
    if (!isRecord(input)) throw new Error("request must be an object");
    const protocolVersion = assertProtocolVersion(input["protocolVersion"], "request");
    const requestId = requireString(input, "requestId", "request");
    const message = parseMessage(input["message"]);
    const conversationId = readString(input, "conversationId");
    const assistantProfileId = readString(input, "assistantProfileId");
    const hostContext = parseHostContext(input["hostContext"]);

    return {
      protocolVersion,
      requestId,
      ...(conversationId ? { conversationId } : {}),
      ...(assistantProfileId ? { assistantProfileId } : {}),
      message,
      ...(hostContext ? { hostContext } : {}),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    throw new ProtocolValidationError(message);
  }
};

const parseMessage = (input: unknown): ChatRequestMessage => {
  if (!isRecord(input)) throw new Error("request.message must be an object");
  const id = requireString(input, "id", "request.message");
  const content = requireString(input, "content", "request.message");
  const role = input["role"];
  if (typeof role !== "string" || !messageRoles.has(role as ChatMessageRole)) {
    throw new Error("request.message.role must be user, assistant, or system");
  }
  return { id, role: role as ChatMessageRole, content };
};

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
    ...(origin ? { origin } : {}),
    ...(url ? { url } : {}),
    ...(title ? { title } : {}),
    ...(metadata ? { metadata } : {}),
  };
};
