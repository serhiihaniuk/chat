import type { AuthContext } from "#domain/auth-context";
import type { TurnMessage, TurnRef, TurnTerminal } from "#domain/turn/turn";

export type BeginTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  userMessage: TurnMessage;
}>;

export interface TurnStore {
  /** Read-only fast rejection; beginTurn repeats these checks atomically. */
  assertCanBegin(auth: AuthContext, conversationId: string): Promise<void>;
  /** Atomically checks ownership and idleness, persists the user message, and opens the turn. */
  beginTurn(input: BeginTurnInput): Promise<TurnRef>;
  bindRun(turn: TurnRef, runId: string): Promise<void>;
  assertRunOwned(auth: AuthContext, conversationId: string, runId: string): Promise<void>;
  claimTerminal(turn: TurnRef, terminal: TurnTerminal): Promise<boolean>;
}
