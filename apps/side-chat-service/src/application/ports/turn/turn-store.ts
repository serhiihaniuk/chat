import type { UIMessage } from "ai";

import type { AuthContext } from "#domain/auth-context";
import type { TurnMessage, TurnRef, TurnTerminal } from "#domain/turn/turn";

export type BeginTurnInput = Readonly<{
  auth: AuthContext;
  conversationId: string;
  requestId: string;
  userMessage: TurnMessage;
}>;

export type FinalizeTurnRecord = Readonly<{
  terminal: TurnTerminal;
  assistantMessage?: UIMessage | undefined;
}>;

export const CANCEL_REQUEST_DISPOSITIONS = {
  DELIVER: "deliver",
  ACKNOWLEDGED: "acknowledged",
} as const;

export type CancelRequestDisposition =
  (typeof CANCEL_REQUEST_DISPOSITIONS)[keyof typeof CANCEL_REQUEST_DISPOSITIONS];

export const TURN_CLAIM_DISPOSITIONS = {
  EXECUTE: "execute",
  CANCEL: "cancel",
  FENCED: "fenced",
} as const;

export type TurnClaimDisposition =
  (typeof TURN_CLAIM_DISPOSITIONS)[keyof typeof TURN_CLAIM_DISPOSITIONS];

export interface TurnStore {
  /** Read-only fast rejection; beginTurn repeats these checks atomically. */
  assertCanBegin(auth: AuthContext, conversationId: string): Promise<void>;
  /** Atomically checks ownership and idleness, persists the user message, and opens the turn. */
  beginTurn(input: BeginTurnInput): Promise<TurnRef>;
  bindRun(turn: TurnRef, runId: string): Promise<void>;
  assertRunOwned(auth: AuthContext, conversationId: string, runId: string): Promise<void>;
  /** Atomically commit visible output, terminal state, and the activity signal. */
  finalize(turn: TurnRef, record: FinalizeTurnRecord): Promise<boolean>;
}

/** Workflow-only fence that must succeed before provider work starts. */
export interface TurnExecutionClaimStore {
  claimRun(turn: TurnRef, runId: string): Promise<TurnClaimDisposition>;
}

/** Cancellation writes durable intent before attempting Workflow delivery. */
export interface TurnCancellationStore {
  requestCancellation(
    auth: AuthContext,
    conversationId: string,
    runId: string,
  ): Promise<CancelRequestDisposition>;
}
