import type { UIMessage } from "ai";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { ConversationTitleStore } from "#application/ports/turn/title/conversation-title-store";
import {
  type ConversationHistoryPage,
  type ConversationHistoryQuery,
  type ConversationQueryStore,
} from "#application/ports/conversation-query-store";
import {
  CANCEL_REQUEST_DISPOSITIONS,
  BEGIN_TURN_DISPOSITIONS,
  TURN_CLAIM_DISPOSITIONS,
  type BeginTurnInput,
  type TurnStore,
} from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "@side-chat/side-chat-server";
import type { TurnMessage, TurnRef, TurnTerminal } from "#domain/turn/turn";

import {
  createInMemoryTurnReference,
  findTurnByRequest,
  listOwnedActiveTurns,
  preflightTurn,
  requireIdleConversation,
  requestConflict,
  sameReplayInput,
  sameOwner,
  type InMemoryStoredTurn,
} from "./in-memory-turn-state/active-turns.js";
import { createInMemoryTurnActivity } from "./in-memory-turn-state/activity.js";
import {
  InMemoryConversationCatalog,
  type SeedConversation,
} from "./in-memory-turn-state/conversations/catalog.js";
import { asError } from "./in-memory-turn-state/errors.js";
import { storedUIMessage, storedUserMessage } from "./in-memory-turn-state/messages.js";
import {
  assertInMemoryRunAccessible,
  findInMemoryActiveTurn,
  readInMemoryConversationState,
  readInMemoryHistoryPage,
} from "./in-memory-turn-state/queries.js";

export type { SeedConversation } from "./in-memory-turn-state/conversations/catalog.js";

/**
 * Disposable local repository that mirrors database ownership and turn fencing.
 * A draft conversation is created atomically with its first accepted turn.
 */
export class InMemoryTurnState
  implements
    ConversationStore,
    ConversationQueryStore,
    ConversationTitleStore,
    TurnStore,
    TurnRunAccess
{
  readonly userMessages: TurnMessage[] = [];
  readonly assistantMessages: UIMessage[] = [];
  readonly terminals = new Map<string, TurnTerminal>();
  readonly runningTurns = new Set<string>();
  private readonly turnActivity = createInMemoryTurnActivity();
  readonly turnActivityNotifications = this.turnActivity.source;

  private readonly conversationCatalog: InMemoryConversationCatalog;
  private readonly turns = new Map<string, InMemoryStoredTurn>();
  private nextTurnNumber = 1;

  constructor(seedConversations: readonly SeedConversation[]) {
    this.conversationCatalog = new InMemoryConversationCatalog(seedConversations);
  }

  assertOwned(auth: AuthContext, conversationId: string): Promise<void> {
    try {
      this.conversationCatalog.requireOwned(auth, conversationId);
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
      this.conversationCatalog.requireOwned(auth, conversationId);
      return Promise.resolve(
        readInMemoryHistoryPage(this.conversationCatalog.readMessages(conversationId), query),
      );
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  readState(auth: AuthContext, conversationId: string) {
    return readInMemoryConversationState(
      this.readHistory(auth, conversationId),
      findInMemoryActiveTurn(
        auth,
        conversationId,
        this.runningTurns,
        this.turns.values(),
        (owner, ownedConversationId) => {
          this.conversationCatalog.requireOwned(owner, ownedConversationId);
        },
      ),
    );
  }

  listConversations(auth: AuthContext) {
    const conversations = [...this.conversationCatalog.conversations.values()]
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
      listOwnedActiveTurns(
        auth,
        this.runningTurns,
        this.conversationCatalog.conversations,
        this.turns.values(),
      ),
    );
  }

  readTitleEligibility(auth: AuthContext, conversationId: string) {
    const conversation = this.conversationCatalog.requireOwned(auth, conversationId);
    return Promise.resolve({
      eligible: conversation.title === undefined,
      ...(conversation.title === undefined ? {} : { existingTitle: conversation.title }),
    });
  }

  prepareConversationTitle(auth: AuthContext, conversationId: string, titleText: string) {
    this.conversationCatalog.prepareTitle(auth, conversationId, titleText);
    return Promise.resolve();
  }

  recordConversationTitleRun(): Promise<void> {
    return Promise.resolve();
  }
  assertCanBegin(
    auth: AuthContext,
    conversationId: string,
    requestId: string,
  ): ReturnType<TurnStore["assertCanBegin"]> {
    try {
      this.conversationCatalog.assertOwnerWhenExists(auth, conversationId);
      return Promise.resolve(
        preflightTurn(auth, conversationId, requestId, this.turns.values(), this.runningTurns),
      );
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }
  beginTurn(input: BeginTurnInput): ReturnType<TurnStore["beginTurn"]> {
    try {
      this.conversationCatalog.assertOwnerWhenExists(input.auth, input.conversationId);
      const replay = findTurnByRequest(this.turns.values(), input.requestId);
      if (replay) {
        if (!sameReplayInput(replay, input)) throw requestConflict();
        return Promise.resolve({
          ...replay.reference,
          disposition: BEGIN_TURN_DISPOSITIONS.REUSED,
          ...(replay.runId === undefined ? {} : { runId: replay.runId }),
        });
      }
      requireIdleConversation(this.runningTurns, input.conversationId);
      this.conversationCatalog.createIfMissing(input.auth, input.conversationId);

      const reference = createInMemoryTurnReference(
        input.conversationId,
        input.auth,
        this.nextTurnNumber,
      );
      this.nextTurnNumber += 1;
      this.runningTurns.add(input.conversationId);
      this.userMessages.push(input.userMessage);
      this.conversationCatalog.appendMessage(
        input.conversationId,
        storedUserMessage(input.userMessage),
      );
      this.turns.set(reference.turnId, {
        reference,
        requestId: input.requestId,
        userMessage: input.userMessage,
      });
      return Promise.resolve({
        ...reference,
        disposition: BEGIN_TURN_DISPOSITIONS.CREATED,
      });
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  bindRun(turn: TurnRef, runId: string): Promise<void> {
    const stored = this.requireTurn(turn);
    if (stored.runId === runId) return Promise.resolve();
    this.turns.set(turn.turnId, { ...stored, runId });
    this.turnActivity.publish(turn);
    return Promise.resolve();
  }

  async claimRun(turn: TurnRef, runId: string) {
    if (this.terminals.has(turn.turnId)) return TURN_CLAIM_DISPOSITIONS.FENCED;
    await this.bindRun(turn, runId);
    return TURN_CLAIM_DISPOSITIONS.EXECUTE;
  }

  assertRunOwned(auth: AuthContext, conversationId: string, runId: string): Promise<void> {
    try {
      this.conversationCatalog.requireOwned(auth, conversationId);
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

  async requestCancellation(auth: AuthContext, conversationId: string, runId: string) {
    await this.assertRunOwned(auth, conversationId, runId);
    return CANCEL_REQUEST_DISPOSITIONS.DELIVER;
  }

  assertAccessible(auth: AuthContext, runId: string): Promise<{ turnId: string }> {
    return assertInMemoryRunAccessible(
      auth,
      runId,
      this.turns.values(),
      (owner, conversationId) => {
        this.conversationCatalog.requireOwned(owner, conversationId);
      },
    );
  }

  finalize(turn: TurnRef, record: Parameters<TurnStore["finalize"]>[1]): Promise<boolean> {
    this.requireTurn(turn);
    if (this.terminals.has(turn.turnId)) return Promise.resolve(false);

    if (record.assistantMessage !== undefined) {
      this.assistantMessages.push(record.assistantMessage);
      this.conversationCatalog.appendMessage(
        turn.conversationId,
        storedUIMessage(record.assistantMessage),
      );
    }
    this.terminals.set(turn.turnId, record.terminal);
    this.runningTurns.delete(turn.conversationId);
    this.turnActivity.publish(turn);
    return Promise.resolve(true);
  }

  private requireTurn(turn: TurnRef): InMemoryStoredTurn {
    const stored = this.turns.get(turn.turnId);
    if (stored?.reference.conversationId !== turn.conversationId) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn not found");
    }
    return stored;
  }
}
