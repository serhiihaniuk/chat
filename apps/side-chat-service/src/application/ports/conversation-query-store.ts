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

export type ActiveConversationTurnSummary = ActiveConversationTurn &
  Readonly<{
    conversationId: string;
  }>;

/** Default newest-first page size when a caller does not request one. */
export const DEFAULT_HISTORY_PAGE_LIMIT = 100;

/**
 * Backward (older-page) cursor for a history read.
 *
 * History is anchored newest-first: the default page is the most recent
 * messages. `beforeSequenceIndex` is an exclusive upper bound — the next page
 * returns the newest messages strictly older than it — so a client walks toward
 * the start of the conversation by following {@link ConversationHistoryPage.nextBeforeSequenceIndex}.
 */
export type ConversationHistoryQuery = Readonly<{
  beforeSequenceIndex?: number | undefined;
  limit?: number | undefined;
}>;

/** One backward page of history plus the cursor for the next, older page. */
export type ConversationHistoryPage = Readonly<{
  messages: readonly StoredConversationMessage[];
  /** True when older messages exist below this page's oldest message. */
  hasMoreBefore: boolean;
  /** Pass as `beforeSequenceIndex` to fetch the next older page; present only when `hasMoreBefore`. */
  nextBeforeSequenceIndex?: number | undefined;
}>;

/** Read-only persistence seam for the route-owned conversation resources. */
export interface ConversationQueryStore {
  readHistory(
    auth: AuthContext,
    conversationId: string,
    query?: ConversationHistoryQuery,
  ): Promise<ConversationHistoryPage>;
  listConversations(auth: AuthContext): Promise<readonly ConversationSummary[]>;
  /** Read every bound running turn owned by this authenticated subject. */
  listActiveTurns(auth: AuthContext): Promise<readonly ActiveConversationTurnSummary[]>;
  findActiveTurn(
    auth: AuthContext,
    conversationId: string,
  ): Promise<ActiveConversationTurn | undefined>;
}
