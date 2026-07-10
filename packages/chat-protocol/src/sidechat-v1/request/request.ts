import { ProtocolValidationError } from "../errors.js";
import { omitUndefinedProperties } from "@side-chat/shared";
import {
  assertProtocolVersion,
  isRecord,
  requireStringField,
  toConversationId,
  toMessageId,
  toRequestId,
  type JsonObject,
  type ConversationId,
  type MessageId,
  type ProtocolEnvelope,
  type RequestId,
} from "../primitives.js";
import { isJsonObject, requireKnownKeys } from "../validation/json-guards.js";

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
 * One host command the host app declares as available for the current turn.
 *
 * The host owns its command set and it varies by page, so the browser sends the
 * currently available commands per request rather than the server holding a
 * catalog. `inputSchema` is the JSON Schema for the payload the model fills in.
 */
export type RequestHostCommand = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

export const CHAT_REASONING_EFFORTS = {
  NONE: "none",
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

export type ChatReasoningEffort =
  (typeof CHAT_REASONING_EFFORTS)[keyof typeof CHAT_REASONING_EFFORTS];

/**
 * Browser-requested model preference for one assistant turn.
 *
 * The service must validate this against its backend model catalog before core
 * builds a runtime request. The browser never sends provider-native options or
 * credentials, only the ids and reasoning effort it learned from `/models`.
 */
export type ChatModelPreference = {
  readonly providerId: string;
  readonly modelId: string;
  readonly reasoningEffort?: ChatReasoningEffort | undefined;
};

/**
 * Browser request for one Side Chat user turn.
 *
 * This is the public `sidechat.v1` request contract. Auth, policy, persistence,
 * role assignment, system instructions, tools, and model validation are added
 * by server-side packages after this DTO is parsed.
 */
export type ChatStreamRequest = ProtocolEnvelope & {
  readonly requestId: RequestId;
  readonly conversationId?: ConversationId;
  readonly turnProfileId?: string;
  readonly model?: ChatModelPreference;
  readonly message: ChatRequestMessage;
  readonly hostContext?: HostContext;
  readonly hostCommands?: readonly RequestHostCommand[];
  /** Composer-selected tool subset; intersects the profile allowlist (absent = profile default, [] = no tools). */
  readonly enabledToolNames?: readonly string[];
};

const REQUEST_FIELDS = [
  "protocolVersion",
  "requestId",
  "conversationId",
  "turnProfileId",
  "model",
  "message",
  "hostContext",
  "hostCommands",
  "enabledToolNames",
] as const;
const MESSAGE_FIELDS = ["id", "content"] as const;
const MODEL_FIELDS = ["providerId", "modelId", "reasoningEffort"] as const;
const HOST_CONTEXT_FIELDS = ["schemaVersion", "origin", "url", "title", "metadata"] as const;
const HOST_COMMAND_FIELDS = ["commandName", "description", "inputSchema"] as const;
const reasoningEfforts = new Set<string>(Object.values(CHAT_REASONING_EFFORTS));

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
    const requestId = toRequestId(requireStringField(input, "requestId", "request"));
    const message = parseMessage(input["message"]);
    const conversationId = readOptionalConversationId(input);
    const turnProfileId = readOptionalString(input, "turnProfileId", "request");
    const model = parseOptionalModelPreference(input);
    const hostContext = parseOptionalHostContext(input);
    const hostCommands = parseOptionalHostCommands(input);
    const enabledToolNames = parseOptionalEnabledToolNames(input);

    return omitUndefinedProperties({
      protocolVersion,
      requestId,
      conversationId,
      turnProfileId,
      model,
      message,
      hostContext,
      hostCommands,
      enabledToolNames,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid request";
    throw new ProtocolValidationError(message);
  }
};

const parseMessage = (input: unknown): ChatRequestMessage => {
  if (!isRecord(input)) throw new Error("request.message must be an object");
  requireKnownKeys(input, MESSAGE_FIELDS, "request.message");
  const id = toMessageId(requireStringField(input, "id", "request.message"));
  const content = requireStringField(input, "content", "request.message");
  return { id, content };
};

const parseOptionalModelPreference = (
  input: Record<string, unknown>,
): ChatModelPreference | undefined => {
  if (!Object.hasOwn(input, "model")) return undefined;
  return parseModelPreference(input["model"]);
};

const parseModelPreference = (input: unknown): ChatModelPreference => {
  if (!isRecord(input)) throw new Error("request.model must be an object");
  requireKnownKeys(input, MODEL_FIELDS, "request.model");
  const providerId = requireStringField(input, "providerId", "request.model");
  const modelId = requireStringField(input, "modelId", "request.model");
  const reasoningEffort = readOptionalReasoningEffort(input);
  return omitUndefinedProperties({ providerId, modelId, reasoningEffort });
};

const readOptionalReasoningEffort = (
  input: Record<string, unknown>,
): ChatReasoningEffort | undefined => {
  const value = readOptionalString(input, "reasoningEffort", "request.model");
  if (value === undefined) return undefined;
  if (reasoningEfforts.has(value)) return value as ChatReasoningEffort;
  throw new Error("request.model.reasoningEffort is not supported");
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
  const schemaVersion = requireStringField(input, "schemaVersion", "request.hostContext");
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

const parseOptionalHostCommands = (
  input: Record<string, unknown>,
): readonly RequestHostCommand[] | undefined => {
  if (!Object.hasOwn(input, "hostCommands")) return undefined;
  const value = input["hostCommands"];
  if (!Array.isArray(value)) throw new Error("request.hostCommands must be an array");
  return value.map(parseHostCommand);
};

const parseHostCommand = (input: unknown): RequestHostCommand => {
  if (!isRecord(input)) throw new Error("request.hostCommands[] must be an object");
  requireKnownKeys(input, HOST_COMMAND_FIELDS, "request.hostCommands[]");
  const commandName = requireStringField(input, "commandName", "request.hostCommands[]");
  const description = requireStringField(input, "description", "request.hostCommands[]");
  const inputSchema = readRequiredJsonObject(input, "inputSchema", "request.hostCommands[]");
  return { commandName, description, inputSchema };
};

const parseOptionalEnabledToolNames = (
  input: Record<string, unknown>,
): readonly string[] | undefined => {
  if (!Object.hasOwn(input, "enabledToolNames")) return undefined;
  const value = input["enabledToolNames"];
  if (!Array.isArray(value)) throw new Error("request.enabledToolNames must be an array");
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    throw new Error("request.enabledToolNames must contain only strings");
  });
};

const readRequiredJsonObject = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): JsonObject => {
  const value = record[key];
  if (!isJsonObject(value)) throw new Error(`${context}.${key} must be a JSON object`);
  return value;
};

const readOptionalString = (
  record: Record<string, unknown>,
  key: string,
  context: string,
): string | undefined => {
  if (!Object.hasOwn(record, key)) return undefined;
  return requireStringField(record, key, context);
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
