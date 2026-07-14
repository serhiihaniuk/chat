import type { ActiveConversationTurnSummary } from "#application/ports/conversation-query-store";
import type { AuthContext } from "#domain/auth-context";
import type { TurnRef } from "#domain/turn/turn";

type OwnedConversation = Readonly<{
  workspaceId: string;
  subjectId: string;
}>;

export type InMemoryStoredTurn = Readonly<{
  reference: TurnRef;
  requestId: string;
  runId?: string;
}>;

/** Project tenant-owned running conversations into the query-store contract. */
export function listOwnedActiveTurns(
  auth: AuthContext,
  runningConversationIds: Iterable<string>,
  conversations: ReadonlyMap<string, OwnedConversation>,
  turns: Iterable<InMemoryStoredTurn>,
): readonly ActiveConversationTurnSummary[] {
  const storedTurns = [...turns];
  const activeTurns: ActiveConversationTurnSummary[] = [];
  for (const conversationId of runningConversationIds) {
    const conversation = conversations.get(conversationId);
    if (!conversation || !sameOwner(auth, conversation)) continue;

    const turn = findLatestBoundTurn(storedTurns, conversationId);
    if (!turn?.runId) continue;
    activeTurns.push({
      conversationId,
      turnId: turn.reference.turnId,
      runId: turn.runId,
      status: "running",
    });
  }
  return activeTurns;
}

/** Return the latest run-bound turn for one conversation. */
export function findLatestBoundTurn(
  turns: Iterable<InMemoryStoredTurn>,
  conversationId: string,
): InMemoryStoredTurn | undefined {
  let latest: InMemoryStoredTurn | undefined;
  for (const turn of turns) {
    if (turn.reference.conversationId === conversationId && turn.runId !== undefined) latest = turn;
  }
  return latest;
}

export function sameOwner(auth: AuthContext, conversation: OwnedConversation): boolean {
  return auth.workspaceId === conversation.workspaceId && auth.subjectId === conversation.subjectId;
}
