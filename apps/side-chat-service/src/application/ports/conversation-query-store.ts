import type { JsonObject } from "@side-chat/shared";

import type { AuthContext } from "#domain/auth-context";

export type StoredConversationMessage = Readonly<{
  id: string;
  role: string;
  parts: readonly JsonObject[];
  metadata: JsonObject;
}>;

export type ConversationSummary = Readonly<{
  id: string;
  status: "active" | "archived" | "reset";
  title?: string | undefined;
  lastMessageAt: string;
}>;

export type ActiveConversationTurn = Readonly<{
  turnId: string;
  runId: string;
  status: "running";
}>;

/** Read-only persistence seam for the route-owned conversation resources. */
export interface ConversationQueryStore {
  readHistory(
    auth: AuthContext,
    conversationId: string,
  ): Promise<readonly StoredConversationMessage[]>;
  listConversations(auth: AuthContext): Promise<readonly ConversationSummary[]>;
  findActiveTurn(
    auth: AuthContext,
    conversationId: string,
  ): Promise<ActiveConversationTurn | undefined>;
}
