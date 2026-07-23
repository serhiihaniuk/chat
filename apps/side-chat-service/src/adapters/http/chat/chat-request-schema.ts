import { safeValidateUIMessages, type UIMessage } from "ai";
import {
  SIDE_CHAT_REASONING_EFFORT_VALUES,
  type SideChatReasoningEffort,
} from "@side-chat/stream-profile";
import { z } from "zod";

import {
  CLIENT_TOOL_CATALOG_LIMITS,
  hasClientToolNameConflict,
  type ClientToolDefinition,
} from "#application/turn/tools/client-tool-catalog";
import { SERVER_TOOL_CATALOG_LIMITS } from "@side-chat/side-chat-server";
import { isSupportedClientToolSchema } from "#application/turn/tools/client-tool-schema";
import type { HostContext, HostContextPolicy } from "#domain/host-context";
import { TURN_MESSAGE_ROLES, type TurnMessage, type TurnMessageRole } from "#domain/turn/turn";

import { parseHostContext } from "./host-context/host-context-schema.js";

const clientToolSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(CLIENT_TOOL_CATALOG_LIMITS.MAX_NAME_LENGTH)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/u),
    description: z.string().trim().min(1).max(CLIENT_TOOL_CATALOG_LIMITS.MAX_DESCRIPTION_LENGTH),
    inputSchema: z.record(z.string(), z.json()),
  })
  .strict();

const enabledToolNamesSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(SERVER_TOOL_CATALOG_LIMITS.MAX_NAME_LENGTH)
      .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/u),
  )
  .max(SERVER_TOOL_CATALOG_LIMITS.MAX_TOOLS)
  .superRefine((names, context) => {
    if (new Set(names).size !== names.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate tool names.",
      });
    }
  });

const chatEnvelopeSchema = z
  .object({
    requestId: z.string().trim().min(1),
    conversationId: z.string().trim().min(1),
    messages: z.array(z.unknown()).min(1),
    modelPreference: z.string().trim().min(1).optional(),
    reasoningEffort: z.enum(SIDE_CHAT_REASONING_EFFORT_VALUES).optional(),
    hostContext: z.unknown().optional(),
    clientTools: z.array(clientToolSchema).max(CLIENT_TOOL_CATALOG_LIMITS.MAX_TOOLS).optional(),
    enabledToolNames: enabledToolNamesSchema.optional(),
  })
  .strict();

const cancelEnvelopeSchema = z.object({ conversationId: z.string().trim().min(1) }).strict();

export type ChatRequest = Readonly<{
  requestId: string;
  conversationId: string;
  messages: readonly TurnMessage[];
  acceptedUserMessage: TurnMessage;
  hostContext?: HostContext | undefined;
  requestedModelId?: string | undefined;
  reasoningEffort?: SideChatReasoningEffort | undefined;
  clientTools: readonly ClientToolDefinition[];
  enabledToolNames?: readonly string[] | undefined;
}>;

/**
 * Validate the untrusted HTTP envelope and project it into the turn contract.
 *
 * Invalid input returns `undefined`: system-role history is rejected, the last
 * message must be the accepted user message, host context requires an enabled
 * policy, and client tools must use supported schemas without colliding with
 * registered server-tool names.
 */
export async function parseChatRequest(
  value: unknown,
  serverToolNames: ReadonlySet<string> = new Set(),
  hostContextPolicy?: HostContextPolicy,
): Promise<ChatRequest | undefined> {
  const envelope = chatEnvelopeSchema.safeParse(value);
  if (!envelope.success) return undefined;
  const hostContext = readHostContext(envelope.data, hostContextPolicy);
  if (hostContext === INVALID_HOST_CONTEXT) return undefined;
  const turnMessages = await readTurnMessages(envelope.data.messages);
  if (turnMessages === undefined) return undefined;
  const clientTools = readClientTools(envelope.data.clientTools, serverToolNames);
  if (clientTools === undefined) return undefined;
  return {
    requestId: envelope.data.requestId,
    conversationId: envelope.data.conversationId,
    messages: turnMessages.messages,
    acceptedUserMessage: turnMessages.acceptedUserMessage,
    ...(hostContext === undefined ? {} : { hostContext }),
    requestedModelId: envelope.data.modelPreference,
    reasoningEffort: envelope.data.reasoningEffort,
    clientTools,
    ...(envelope.data.enabledToolNames === undefined
      ? {}
      : { enabledToolNames: envelope.data.enabledToolNames }),
  };
}

async function readTurnMessages(
  candidates: readonly unknown[],
): Promise<
  Readonly<{ messages: readonly TurnMessage[]; acceptedUserMessage: TurnMessage }> | undefined
> {
  const validated = await safeValidateUIMessages({ messages: candidates });
  if (!validated.success || validated.data.some((message) => message.role === "system")) {
    return undefined;
  }
  if (validated.data.at(-1)?.role !== "user") return undefined;
  const messages = validated.data.map(toTurnMessage);
  const acceptedUserMessage = messages.at(-1);
  return acceptedUserMessage === undefined ? undefined : { messages, acceptedUserMessage };
}

function readClientTools(
  candidates: readonly ClientToolDefinition[] | undefined,
  serverToolNames: ReadonlySet<string>,
): readonly ClientToolDefinition[] | undefined {
  const clientTools = candidates ?? [];
  if (hasClientToolNameConflict(clientTools, serverToolNames)) return undefined;
  if (clientTools.some((tool) => !isSupportedClientToolSchema(tool.inputSchema))) return undefined;
  return clientTools;
}

const INVALID_HOST_CONTEXT = Symbol("invalid-host-context");

function readHostContext(
  envelope: Readonly<Record<string, unknown>>,
  policy: HostContextPolicy | undefined,
): HostContext | typeof INVALID_HOST_CONTEXT | undefined {
  if (!Object.hasOwn(envelope, "hostContext")) return undefined;
  if (policy === undefined) return INVALID_HOST_CONTEXT;
  return parseHostContext(envelope["hostContext"], policy) ?? INVALID_HOST_CONTEXT;
}

function toTurnMessage(message: UIMessage): TurnMessage {
  return {
    id: message.id,
    role: toTurnMessageRole(message),
    text: message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(""),
  };
}

function toTurnMessageRole(message: UIMessage): TurnMessageRole {
  if (message.role === "user") return TURN_MESSAGE_ROLES.USER;
  return TURN_MESSAGE_ROLES.ASSISTANT;
}

export function parseCancelRequest(
  value: unknown,
): { readonly conversationId: string } | undefined {
  const result = cancelEnvelopeSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
