import { safeValidateUIMessages, type UIMessage } from "ai";

import type {
  ConversationHistoryQuery,
  ConversationQueryStore,
  StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { AuthContext } from "#domain/auth-context";

export const UNAVAILABLE_HISTORY_TEXT = "Historical content is unavailable after an upgrade";

type ValidateUIMessagesArgs = Parameters<typeof safeValidateUIMessages>[0];

/**
 * The current tool/data schemas a persisted structured part is validated against.
 *
 * A `tool-*`/`data-*` part survives a read only when its owning schema is present
 * here and the part validates against it. The default is empty
 * ({@link EMPTY_STRUCTURED_PART_CATALOGS}), so today every structured part
 * degrades; wiring a real catalog through this seam lets a future tool or data
 * schema be honored without changing the read logic.
 */
export type StructuredPartCatalogs = Readonly<{
  tools: NonNullable<ValidateUIMessagesArgs["tools"]>;
  dataSchemas: NonNullable<ValidateUIMessagesArgs["dataSchemas"]>;
}>;

export const EMPTY_STRUCTURED_PART_CATALOGS: StructuredPartCatalogs = {
  tools: {},
  dataSchemas: {},
};

export type ReadConversationHistoryDependencies = Readonly<{
  queries: Pick<ConversationQueryStore, "readHistory">;
  telemetry: Pick<TelemetrySink, "record">;
  /** Current tool/data schemas honored on read; omit to degrade every structured part. */
  structuredPartCatalogs?: StructuredPartCatalogs | undefined;
}>;

export type ConversationHistoryResult = Readonly<{
  messages: readonly UIMessage[];
  /** True when older messages remain below the returned page. */
  hasMore: boolean;
  /** Opaque cursor for the next older page; pass back as `before`. Present only when `hasMore`. */
  nextCursor?: number | undefined;
}>;

/** Validate persisted SDK messages at the read boundary and degrade drift per message. */
export async function readConversationHistory(
  dependencies: ReadConversationHistoryDependencies,
  auth: AuthContext,
  conversationId: string,
  query?: ConversationHistoryQuery,
): Promise<ConversationHistoryResult> {
  const catalogs = dependencies.structuredPartCatalogs ?? EMPTY_STRUCTURED_PART_CATALOGS;
  const page = await dependencies.queries.readHistory(auth, conversationId, query);
  const messages = await Promise.all(
    page.messages.map((message) => validateStoredMessage(dependencies, catalogs, message)),
  );
  return {
    messages,
    hasMore: page.hasMoreBefore,
    ...(page.nextBeforeSequenceIndex === undefined
      ? {}
      : { nextCursor: page.nextBeforeSequenceIndex }),
  };
}

async function validateStoredMessage(
  dependencies: ReadConversationHistoryDependencies,
  catalogs: StructuredPartCatalogs,
  message: StoredConversationMessage,
): Promise<UIMessage> {
  const candidate = toValidationCandidate(message);
  const validated = await safeValidateUIMessages({
    messages: [candidate],
    tools: catalogs.tools,
    dataSchemas: catalogs.dataSchemas,
  });
  if (validated.success && !containsUnownedStructuredPart(message, catalogs)) {
    return requireFirst(validated.data);
  }

  await dependencies.telemetry.record({ type: "persistence.history_drift" });
  return textOnlyProjection(message);
}

/**
 * A structured part is drift when the current catalog owns no schema for it.
 *
 * `safeValidateUIMessages` already fails a message that carries an unowned data
 * part or an unowned tool part in a non-output state, but it tolerates an unowned
 * tool part in an output state; this check catches that residue so no unowned
 * structured part is ever returned. An owned, valid part is not drift and is kept.
 */
function containsUnownedStructuredPart(
  message: StoredConversationMessage,
  catalogs: StructuredPartCatalogs,
): boolean {
  return message.parts.some((part) => {
    const type = part["type"];
    if (typeof type !== "string") return false;
    if (type.startsWith("tool-")) return !Object.hasOwn(catalogs.tools, type.slice(5));
    if (type.startsWith("data-")) return !Object.hasOwn(catalogs.dataSchemas, type.slice(5));
    return false;
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
