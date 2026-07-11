import { safeValidateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

import { TURN_MESSAGE_ROLES, type TurnMessage, type TurnMessageRole } from "#domain/turn/turn";

const chatEnvelopeSchema = z
  .object({
    requestId: z.string().trim().min(1),
    conversationId: z.string().trim().min(1),
    messages: z.array(z.unknown()).min(1),
    modelPreference: z.string().trim().min(1).optional(),
    clientTools: z.array(z.unknown()).optional(),
  })
  .strict();

const cancelEnvelopeSchema = z.object({ conversationId: z.string().trim().min(1) }).strict();

export type ChatRequest = Readonly<{
  requestId: string;
  conversationId: string;
  messages: readonly TurnMessage[];
  acceptedUserMessage: TurnMessage;
  requestedModelId?: string | undefined;
  clientTools: readonly unknown[];
}>;

export async function parseChatRequest(value: unknown): Promise<ChatRequest | undefined> {
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
  const messages = validated.data.map(toTurnMessage);
  const acceptedUserMessage = messages.at(-1);
  if (acceptedUserMessage === undefined) return undefined;
  return {
    requestId: envelope.data.requestId,
    conversationId: envelope.data.conversationId,
    messages,
    acceptedUserMessage,
    requestedModelId: envelope.data.modelPreference,
    clientTools: envelope.data.clientTools ?? [],
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
