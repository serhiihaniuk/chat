import type { ActiveConversationTurnSummary } from "#application/ports/conversation-query-store";
import type { BeginTurnInput } from "#application/ports/turn/turn-store";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import type { TurnMessage, TurnRef } from "#domain/turn/turn";

type OwnedConversation = Readonly<{
  workspaceId: string;
  subjectId: string;
}>;

export type InMemoryStoredTurn = Readonly<{
  reference: TurnRef;
  requestId: string;
  userMessage: TurnMessage;
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

export function findTurnByRequest(
  turns: Iterable<InMemoryStoredTurn>,
  requestId: string,
): InMemoryStoredTurn | undefined {
  return [...turns].find((turn) => turn.requestId === requestId);
}

export function createInMemoryTurnReference(
  conversationId: string,
  auth: AuthContext,
  turnNumber: number,
): TurnRef {
  return {
    conversationId,
    turnId: `turn-${turnNumber}`,
    workspaceId: auth.workspaceId,
    subjectId: auth.subjectId,
  };
}

export function sameReplayOwner(
  stored: InMemoryStoredTurn,
  auth: AuthContext,
  conversationId: string,
): boolean {
  return (
    stored.reference.workspaceId === auth.workspaceId &&
    stored.reference.subjectId === auth.subjectId &&
    stored.reference.conversationId === conversationId
  );
}

export function sameReplayInput(stored: InMemoryStoredTurn, input: BeginTurnInput): boolean {
  return (
    sameReplayOwner(stored, input.auth, input.conversationId) &&
    stored.userMessage.id === input.userMessage.id &&
    stored.userMessage.role === input.userMessage.role &&
    stored.userMessage.text === input.userMessage.text
  );
}

export function requestConflict(): TurnRejectedError {
  return new TurnRejectedError(
    TURN_REJECTION_CODES.REQUEST_CONFLICT,
    "The request id was already used for a different turn request",
  );
}

export function requireIdleConversation(
  runningConversationIds: ReadonlySet<string>,
  conversationId: string,
): void {
  if (!runningConversationIds.has(conversationId)) return;
  throw new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation already has a running turn");
}
