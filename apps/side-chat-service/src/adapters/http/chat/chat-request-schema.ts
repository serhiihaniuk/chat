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
import { SERVER_TOOL_CATALOG_LIMITS } from "#application/turn/tools/server-tools/server-tool-catalog";
import { isSupportedClientToolSchema } from "#application/turn/tools/client-tool-schema";
import { TURN_MESSAGE_ROLES, type TurnMessage, type TurnMessageRole } from "#domain/turn/turn";

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
  requestedModelId?: string | undefined;
  reasoningEffort?: SideChatReasoningEffort | undefined;
  clientTools: readonly ClientToolDefinition[];
  enabledToolNames?: readonly string[] | undefined;
}>;

export async function parseChatRequest(
  value: unknown,
  serverToolNames: ReadonlySet<string> = new Set(),
): Promise<ChatRequest | undefined> {
  const envelope = chatEnvelopeSchema.safeParse(value);
  if (!envelope.success) return undefined;
  const validated = await safeValidateUIMessages({
    messages: envelope.data.messages,
  });
  if (!validated.success || validated.data.some((message) => message.role === "system")) {
    return undefined;
  }
  const acceptedUiMessage = validated.data.at(-1);
  if (acceptedUiMessage?.role !== "user") return undefined;
  const clientTools = envelope.data.clientTools ?? [];
  if (hasClientToolNameConflict(clientTools, serverToolNames)) return undefined;
  if (clientTools.some((tool) => !isSupportedClientToolSchema(tool.inputSchema))) return undefined;
  const messages = validated.data.map(toTurnMessage);
  const acceptedUserMessage = messages.at(-1);
  if (acceptedUserMessage === undefined) return undefined;
  return {
    requestId: envelope.data.requestId,
    conversationId: envelope.data.conversationId,
    messages,
    acceptedUserMessage,
    requestedModelId: envelope.data.modelPreference,
    reasoningEffort: envelope.data.reasoningEffort,
    clientTools,
    ...(envelope.data.enabledToolNames === undefined
      ? {}
      : { enabledToolNames: envelope.data.enabledToolNames }),
  };
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
