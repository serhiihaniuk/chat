import { safeValidateUIMessages, type UIMessage } from "ai";

import type {
  ConversationQueryStore,
  StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { AuthContext } from "#domain/auth-context";

export const UNAVAILABLE_HISTORY_TEXT = "Historical content is unavailable after an upgrade";

export type ReadConversationHistoryDependencies = Readonly<{
  queries: Pick<ConversationQueryStore, "readHistory">;
  telemetry: Pick<TelemetrySink, "record">;
}>;

/** Validate persisted SDK messages at the read boundary and degrade drift per message. */
export async function readConversationHistory(
  dependencies: ReadConversationHistoryDependencies,
  auth: AuthContext,
  conversationId: string,
): Promise<readonly UIMessage[]> {
  const storedMessages = await dependencies.queries.readHistory(auth, conversationId);
  return Promise.all(storedMessages.map((message) => validateStoredMessage(dependencies, message)));
}

async function validateStoredMessage(
  dependencies: ReadConversationHistoryDependencies,
  message: StoredConversationMessage,
): Promise<UIMessage> {
  const candidate = toValidationCandidate(message);
  // Passing the empty current catalogs is intentional. Unlike omitting them,
  // this rejects persisted tool/data parts whose owning schema no longer exists.
  const validated = await safeValidateUIMessages({
    messages: [candidate],
    tools: {},
    dataSchemas: {},
  });
  if (validated.success && !containsUnownedStructuredPart(message)) {
    return requireFirst(validated.data);
  }

  await dependencies.telemetry.record({ type: "persistence.history_drift" });
  return textOnlyProjection(message);
}

function containsUnownedStructuredPart(message: StoredConversationMessage): boolean {
  return message.parts.some((part) => {
    const type = part["type"];
    return typeof type === "string" && (type.startsWith("tool-") || type.startsWith("data-"));
  });
}

function toValidationCandidate(message: StoredConversationMessage) {
  return {
    id: message.id,
    role: message.role,
    parts: [...message.parts],
    metadata: message.metadata,
  };
}

function textOnlyProjection(message: StoredConversationMessage): UIMessage {
  const parts = message.parts.flatMap((part) => {
    if (part["type"] !== "text" || typeof part["text"] !== "string") return [];
    return [{ type: "text" as const, text: part["text"] }];
  });
  return {
    id: message.id,
    role: historyRole(message.role),
    parts: parts.length > 0 ? parts : [{ type: "text", text: UNAVAILABLE_HISTORY_TEXT }],
  };
}

function historyRole(role: string): UIMessage["role"] {
  if (role === "user" || role === "system") return role;
  return "assistant";
}

function requireFirst(messages: readonly UIMessage[]): UIMessage {
  const message = messages[0];
  if (!message) throw new Error("Validated history unexpectedly contained no message.");
  return message;
}
