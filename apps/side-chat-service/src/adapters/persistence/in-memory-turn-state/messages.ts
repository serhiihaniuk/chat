import { toJsonObject, type JsonObject } from "@side-chat/shared";
import type { UIMessage } from "ai";

import type { StoredConversationMessage } from "#application/ports/conversation-query-store";
import type { TurnMessage } from "#domain/turn/turn";

export function storedUserMessage(message: TurnMessage): StoredConversationMessage {
  return {
    id: message.id,
    role: message.role,
    parts: [{ type: "text", text: message.text }],
    metadata: {},
  };
}

export function storedUIMessage(message: UIMessage): StoredConversationMessage {
  return {
    id: message.id,
    role: message.role,
    parts: message.parts.map(toJsonObject),
    metadata: optionalMetadata(message.metadata),
  };
}

function optionalMetadata(metadata: unknown): JsonObject {
  return metadata === undefined ? {} : toJsonObject(metadata);
}
