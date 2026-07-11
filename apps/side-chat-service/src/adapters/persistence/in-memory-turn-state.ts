import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { BeginTurnInput, TurnStore } from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import type { TurnMessage, TurnRef, TurnTerminal } from "#domain/turn/turn";

export type SeedConversation = Readonly<{
  conversationId: string;
  workspaceId: string;
  subjectId: string;
}>;

type StoredTurn = Readonly<{
  reference: TurnRef;
  requestId: string;
  runId?: string;
}>;

/**
 * Disposable Step 05 repository for local service and contract tests. The seed
 * list is the complete conversation catalog: unknown ids and mismatched owners
 * are rejected exactly as a database adapter would reject them. Step 09 replaces
 * this class without changing the application ports.
 */
export class InMemoryTurnState
  implements ConversationStore, ConversationQueryStore, MessageStore, TurnStore, TurnRunAccess
{
  readonly userMessages: TurnMessage[] = [];
  readonly assistantMessages: TurnMessage[] = [];
  readonly terminals = new Map<string, TurnTerminal>();
  readonly runningTurns = new Set<string>();

  private readonly conversations = new Map<string, SeedConversation>();
  private readonly conversationMessages = new Map<string, TurnMessage[]>();
  private readonly turns = new Map<string, StoredTurn>();
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

  readHistory(auth: AuthContext, conversationId: string) {
    try {
      this.requireOwnedConversation(auth, conversationId);
      const messages = this.conversationMessages.get(conversationId) ?? [];
      return Promise.resolve(
        messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: [{ type: "text", text: message.text }],
          metadata: {},
        })),
      );
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
        lastMessageAt: auth.issuedAt,
      }));
    return Promise.resolve(conversations);
  }

  findActiveTurn(auth: AuthContext, conversationId: string) {
    try {
      this.requireOwnedConversation(auth, conversationId);
      const active = [...this.turns.values()].find(
        (turn) =>
          turn.reference.conversationId === conversationId &&
          this.runningTurns.has(conversationId) &&
          turn.runId !== undefined,
      );
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

      const reference = this.createTurnReference(input.conversationId);
      this.runningTurns.add(input.conversationId);
      this.userMessages.push(input.userMessage);
      this.appendConversationMessage(input.conversationId, input.userMessage);
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
      return Promise.reject(asRunNotFound(error));
    }
  }

  appendAssistantMessage(turn: TurnRef, message: TurnMessage): Promise<void> {
    this.requireTurn(turn);
    this.assistantMessages.push(message);
    this.appendConversationMessage(turn.conversationId, message);
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

  private requireTurn(turn: TurnRef): StoredTurn {
    const stored = this.turns.get(turn.turnId);
    if (stored?.reference.conversationId !== turn.conversationId) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn not found");
    }
    return stored;
  }

  private createTurnReference(conversationId: string): TurnRef {
    const turnId = `turn-${this.nextTurnNumber}`;
    this.nextTurnNumber += 1;
    return { conversationId, turnId };
  }

  private appendConversationMessage(conversationId: string, message: TurnMessage): void {
    const messages = this.conversationMessages.get(conversationId) ?? [];
    this.conversationMessages.set(conversationId, [...messages, message]);
  }
}

function sameOwner(auth: AuthContext, conversation: SeedConversation): boolean {
  return auth.workspaceId === conversation.workspaceId && auth.subjectId === conversation.subjectId;
}

function asError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error("Unexpected in-memory turn-state failure", { cause: error });
}

function runNotFound(): TurnRejectedError {
  return new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
}

function asRunNotFound(error: unknown): TurnRejectedError {
  if (error instanceof TurnRejectedError) return runNotFound();
  throw error;
}
