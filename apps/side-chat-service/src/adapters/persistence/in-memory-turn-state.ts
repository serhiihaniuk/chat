import type { UIMessage } from "ai";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  type ConversationHistoryPage,
  type ConversationHistoryQuery,
  type ConversationQueryStore,
  type StoredConversationMessage,
} from "#application/ports/conversation-query-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { BeginTurnInput, TurnStore } from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import type { TurnMessage, TurnRef, TurnTerminal } from "#domain/turn/turn";

import {
  findLatestBoundTurn,
  listOwnedActiveTurns,
  sameOwner,
  type InMemoryStoredTurn,
} from "./in-memory-turn-state/active-turns.js";
import { storedUIMessage, storedUserMessage } from "./in-memory-turn-state/messages.js";

export type SeedConversation = Readonly<{
  conversationId: string;
  workspaceId: string;
  subjectId: string;
  title?: string | undefined;
}>;

/**
 * Disposable Step 05 repository for local service and contract tests. The seed
 * list is the complete conversation catalog: unknown ids and mismatched owners
 * are rejected exactly as a database adapter would reject them. Step 09 replaces
 * this class without changing the application ports.
 */
export class InMemoryTurnState
  implements
    ConversationStore,
    ConversationQueryStore,
    ConversationTitleStore,
    MessageStore,
    TurnStore,
    TurnRunAccess
{
  readonly userMessages: TurnMessage[] = [];
  readonly assistantMessages: UIMessage[] = [];
  readonly terminals = new Map<string, TurnTerminal>();
  readonly runningTurns = new Set<string>();

  private readonly conversations = new Map<string, SeedConversation>();
  private readonly conversationMessages = new Map<string, StoredConversationMessage[]>();
  private readonly turns = new Map<string, InMemoryStoredTurn>();
  private nextTurnNumber = 1;

  constructor(seedConversations: readonly SeedConversation[]) {
    for (const conversation of seedConversations) {
      this.conversations.set(conversation.conversationId, conversation);
    }
  }

  assertOwned(auth: AuthContext, conversationId: string): Promise<void> {
    try {
      this.requireOwnedConversation(auth, conversationId);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  readHistory(
    auth: AuthContext,
    conversationId: string,
    query?: ConversationHistoryQuery,
  ): Promise<ConversationHistoryPage> {
    try {
      this.requireOwnedConversation(auth, conversationId);
      // Backward paging over array position as the sequence index, mirroring the
      // Postgres adapter: `beforeSequenceIndex` is an exclusive upper bound and
      // `nextBeforeSequenceIndex` is the oldest returned position, present only
      // while older messages remain.
      const all = this.conversationMessages.get(conversationId) ?? [];
      const limit = query?.limit ?? DEFAULT_HISTORY_PAGE_LIMIT;
      const upperExclusive = Math.min(query?.beforeSequenceIndex ?? all.length, all.length);
      const start = Math.max(0, upperExclusive - limit);
      const hasMoreBefore = start > 0;
      const nextBeforeSequenceIndex = hasMoreBefore ? start : undefined;
      return Promise.resolve({
        messages: all.slice(start, upperExclusive),
        hasMoreBefore,
        ...(nextBeforeSequenceIndex === undefined ? {} : { nextBeforeSequenceIndex }),
      });
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  listConversations(auth: AuthContext) {
    const conversations = [...this.conversations.values()]
      .filter((conversation) => sameOwner(auth, conversation))
      .map((conversation) => ({
        id: conversation.conversationId,
        status: "active" as const,
        ...(conversation.title === undefined ? {} : { title: conversation.title }),
        lastMessageAt: auth.issuedAt,
      }));
    return Promise.resolve(conversations);
  }

  listActiveTurns(auth: AuthContext) {
    return Promise.resolve(
      listOwnedActiveTurns(auth, this.runningTurns, this.conversations, this.turns.values()),
    );
  }

  readTitleEligibility(auth: AuthContext, conversationId: string, initialUserMessageId: string) {
    const conversation = this.requireOwnedConversation(auth, conversationId);
    const firstMessage = this.conversationMessages.get(conversationId)?.[0];
    return Promise.resolve({
      eligible: conversation.title === undefined && firstMessage?.id === initialUserMessageId,
      ...(conversation.title === undefined ? {} : { existingTitle: conversation.title }),
    });
  }

  prepareConversationTitle(auth: AuthContext, conversationId: string, titleText: string) {
    const conversation = this.requireOwnedConversation(auth, conversationId);
    if (conversation.title === undefined) {
      this.conversations.set(conversationId, { ...conversation, title: titleText });
    }
    return Promise.resolve();
  }

  recordConversationTitleRun(): Promise<void> {
    // No durable Workflow journal exists here, so title-run linkage is a no-op.
    return Promise.resolve();
  }

  findActiveTurn(auth: AuthContext, conversationId: string) {
    try {
      this.requireOwnedConversation(auth, conversationId);
      const active = this.runningTurns.has(conversationId)
        ? findLatestBoundTurn(this.turns.values(), conversationId)
        : undefined;
      return Promise.resolve(
        active?.runId
          ? { turnId: active.reference.turnId, runId: active.runId, status: "running" as const }
          : undefined,
      );
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  assertCanBegin(auth: AuthContext, conversationId: string): Promise<void> {
    try {
      this.requireOwnedConversation(auth, conversationId);
      this.requireIdleConversation(conversationId);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  beginTurn(input: BeginTurnInput): Promise<TurnRef> {
    try {
      this.requireOwnedConversation(input.auth, input.conversationId);
      this.requireIdleConversation(input.conversationId);

      const reference = this.createTurnReference(input.conversationId, input.auth);
      this.runningTurns.add(input.conversationId);
      this.userMessages.push(input.userMessage);
      this.appendConversationMessage(input.conversationId, storedUserMessage(input.userMessage));
      this.turns.set(reference.turnId, {
        reference,
        requestId: input.requestId,
      });
      return Promise.resolve(reference);
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  bindRun(turn: TurnRef, runId: string): Promise<void> {
    const stored = this.requireTurn(turn);
    this.turns.set(turn.turnId, { ...stored, runId });
    return Promise.resolve();
  }

  assertRunOwned(auth: AuthContext, conversationId: string, runId: string): Promise<void> {
    try {
      this.requireOwnedConversation(auth, conversationId);
      const matches = [...this.turns.values()].some(
        (turn) => turn.reference.conversationId === conversationId && turn.runId === runId,
      );
      if (!matches) {
        throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
      }
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  assertAccessible(auth: AuthContext, runId: string): Promise<void> {
    try {
      const turn = [...this.turns.values()].find((candidate) => candidate.runId === runId);
      if (!turn) throw runNotFound();
      this.requireOwnedConversation(auth, turn.reference.conversationId);
      return Promise.resolve();
    } catch (error) {
      // A run-only route must not distinguish an unknown id from another
      // tenant's id, even though conversation routes retain their richer errors.
      if (error instanceof TurnRejectedError) {
        return Promise.reject(runNotFound());
      }
      return Promise.reject(asError(error));
    }
  }

  appendAssistantMessage(turn: TurnRef, message: UIMessage): Promise<void> {
    this.requireTurn(turn);
    this.assistantMessages.push(message);
    this.appendConversationMessage(turn.conversationId, storedUIMessage(message));
    return Promise.resolve();
  }

  claimTerminal(turn: TurnRef, terminal: TurnTerminal): Promise<boolean> {
    this.requireTurn(turn);
    if (this.terminals.has(turn.turnId)) return Promise.resolve(false);

    this.terminals.set(turn.turnId, terminal);
    this.runningTurns.delete(turn.conversationId);
    return Promise.resolve(true);
  }

  private requireOwnedConversation(auth: AuthContext, conversationId: string): SeedConversation {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.NOT_FOUND, "Conversation not found");
    }

    if (!sameOwner(auth, conversation)) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.FORBIDDEN, "Conversation access denied");
    }
    return conversation;
  }

  private requireIdleConversation(conversationId: string): void {
    if (!this.runningTurns.has(conversationId)) return;

    throw new TurnRejectedError(
      TURN_REJECTION_CODES.BUSY,
      "Conversation already has a running turn",
    );
  }

  private requireTurn(turn: TurnRef): InMemoryStoredTurn {
    const stored = this.turns.get(turn.turnId);
    if (stored?.reference.conversationId !== turn.conversationId) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn not found");
    }
    return stored;
  }

  private createTurnReference(conversationId: string, auth: AuthContext): TurnRef {
    const turnId = `turn-${this.nextTurnNumber}`;
    this.nextTurnNumber += 1;
    return {
      conversationId,
      turnId,
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    };
  }

  private appendConversationMessage(
    conversationId: string,
    message: StoredConversationMessage,
  ): void {
    const messages = this.conversationMessages.get(conversationId) ?? [];
    this.conversationMessages.set(conversationId, [...messages, message]);
  }
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Unexpected in-memory turn-state failure", { cause: error });
}

function runNotFound(): TurnRejectedError {
  return new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
}
