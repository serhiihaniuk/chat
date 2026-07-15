import type {
  ActiveConversationTurn,
  ConversationHistoryPage,
  ConversationStateSnapshot,
} from "#application/ports/conversation-query-store";
import { TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";

import { findLatestBoundTurn, type InMemoryStoredTurn } from "./active-turns.js";
import { asError, runNotFound } from "./errors.js";

/** Combine values captured synchronously by the in-memory query adapter. */
export async function readInMemoryConversationState(
  history: Promise<ConversationHistoryPage>,
  activeTurn: Promise<ActiveConversationTurn | undefined>,
): Promise<ConversationStateSnapshot> {
  const [resolvedHistory, resolvedActiveTurn] = await Promise.all([history, activeTurn]);
  return {
    history: resolvedHistory,
    ...(resolvedActiveTurn === undefined ? {} : { activeTurn: resolvedActiveTurn }),
  };
}

export function findInMemoryActiveTurn(
  auth: AuthContext,
  conversationId: string,
  runningTurns: ReadonlySet<string>,
  turns: Iterable<InMemoryStoredTurn>,
  requireOwnedConversation: (auth: AuthContext, conversationId: string) => void,
): Promise<ActiveConversationTurn | undefined> {
  try {
    requireOwnedConversation(auth, conversationId);
    const active = runningTurns.has(conversationId)
      ? findLatestBoundTurn(turns, conversationId)
      : undefined;
    return Promise.resolve(
      active?.runId
        ? { turnId: active.reference.turnId, runId: active.runId, status: "running" }
        : undefined,
    );
  } catch (error) {
    return Promise.reject(asError(error));
  }
}

/** Preserve run-id non-enumerability while returning the owned product turn. */
export function assertInMemoryRunAccessible(
  auth: AuthContext,
  runId: string,
  turns: Iterable<InMemoryStoredTurn>,
  requireOwnedConversation: (auth: AuthContext, conversationId: string) => void,
): Promise<{ turnId: string }> {
  try {
    const turn = [...turns].find((candidate) => candidate.runId === runId);
    if (!turn) throw runNotFound();
    requireOwnedConversation(auth, turn.reference.conversationId);
    return Promise.resolve({ turnId: turn.reference.turnId });
  } catch (error) {
    if (error instanceof TurnRejectedError) return Promise.reject(runNotFound());
    return Promise.reject(asError(error));
  }
}
