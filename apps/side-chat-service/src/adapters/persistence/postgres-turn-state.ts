import {
  createPostgresDrizzleSidechatRepositories,
  DbRepositoryError,
  uniqueViolationConstraint,
  type SidechatRepositories,
} from "@side-chat/db";

import type { ConversationStore } from "#application/ports/turn/conversation-store";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { MessageStore } from "#application/ports/turn/message-store";
import type { BeginTurnInput, TurnStore } from "#application/ports/turn/turn-store";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import { TURN_REJECTION_CODES, TurnRejectedError } from "#application/turn/turn-errors";
import type { AuthContext } from "#domain/auth-context";
import { TURN_MESSAGE_ROLES } from "#domain/turn/turn";

import { createPostgresConversationQueries } from "./postgres-turn-state/conversation-queries.js";

/** The write/cancel store surface the chat routes depend on, plus pool disposal. */
export type PostgresTurnState = ConversationStore &
  ConversationQueryStore &
  MessageStore &
  TurnStore &
  TurnRunAccess & { close: () => Promise<void> };

/** Repositories that also own their connection pool, as the pg-drizzle factory returns. */
type ClosableRepositories = SidechatRepositories & { close: () => Promise<void> };

/**
 * The tenant identity a turn was opened under.
 *
 * Later write ports carry only a `TurnRef`, so `beginTurn` records the request
 * identity needed to keep every database write tenant-scoped. This is valid for
 * the current single-instance prepare-to-finalize path; durable resumed writes
 * will need to recover identity from the turn row.
 */
type TurnIdentity = Readonly<{ workspaceId: string; subjectId: string }>;

type TurnStateContext = Readonly<{
  repositories: SidechatRepositories;
  identities: Map<string, TurnIdentity>;
}>;

/**
 * Postgres's default primary-key constraint name for `sidechat.conversations`
 * (`conversation_id`). A create with an id already owned by another subject
 * misses the `(workspace, subject, key)` upsert target and trips this instead,
 * which we read as a cross-subject collision.
 */
const CONVERSATIONS_PRIMARY_KEY_CONSTRAINT = "conversations_pkey";

// Provenance columns are non-null, so a running turn needs *some* value before
// the model has been selected. These are honest placeholders, not real data.
// TODO(step-18): thread real provenance (provider, model, prompt/config/filter
// versions) from the model policy through BeginTurnInput.
const PENDING_PROVENANCE = {
  modelProvider: "pending",
  modelId: "pending",
  instructionsVersion: "v1",
  configVersion: "v1",
  contentFilterVersion: "v1",
} as const;

/**
 * Real Postgres persistence for the turn write/cancel path.
 *
 * Maps the service's turn ports onto `@side-chat/db` repositories. The service
 * `conversationId` is passed through as both the db `conversationId` and its
 * `conversationKey`; `actorId` is the `subjectId`.
 */
export const createPostgresTurnState = (connectionString: string): PostgresTurnState =>
  createTurnStateFromRepositories(createPostgresDrizzleSidechatRepositories({ connectionString }));

/**
 * Build the turn store over any repositories implementation.
 *
 * The seam that lets a test drive the exact port -> db mapping and error
 * translation with a hand-written fake, without a live Postgres.
 */
export const createTurnStateFromRepositories = (
  repositories: ClosableRepositories,
): PostgresTurnState => {
  const context: TurnStateContext = { repositories, identities: new Map() };
  const queries = createPostgresConversationQueries(repositories);
  return {
    assertOwned: assertOwned(context),
    ...queries,
    assertCanBegin: assertCanBegin(context),
    beginTurn: beginTurn(context),
    bindRun: bindRun(context),
    assertRunOwned: assertRunOwned(context),
    assertAccessible: assertRunAccessible(context),
    appendAssistantMessage: appendAssistantMessage(context),
    claimTerminal: claimTerminal(context),
    close: repositories.close,
  };
};

const assertOwned =
  ({ repositories }: TurnStateContext): ConversationStore["assertOwned"] =>
  async (auth, conversationId) => {
    const conversation = await repositories.findConversation({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
    });
    if (!conversation) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.NOT_FOUND, "Conversation not found");
    }
  };

const assertCanBegin =
  ({ repositories }: TurnStateContext): TurnStore["assertCanBegin"] =>
  async (auth, conversationId) => {
    // Fast pre-check only: a missing conversation is fine (a first turn creates
    // it). The race-safe guard is the one-running-per-conversation unique index
    // enforced atomically inside beginTurn.
    const active = await repositories.findActiveAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
    });
    if (active) {
      throw busy();
    }
  };

const beginTurn =
  (context: TurnStateContext): TurnStore["beginTurn"] =>
  async (input) => {
    const { repositories, identities } = context;
    const { auth, conversationId, userMessage } = input;
    const now = new Date().toISOString();

    await createConversation(repositories, auth, conversationId, now);
    await repositories.appendMessage({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      conversationId,
      messageId: userMessage.id,
      role: TURN_MESSAGE_ROLES.USER,
      parts: [{ type: "text", text: userMessage.text }],
      metadataJson: {},
      now,
    });
    const turnRecord = await startTurn(repositories, input, now);

    identities.set(turnRecord.assistantTurnId, {
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
    });
    return { conversationId, turnId: turnRecord.assistantTurnId };
  };

const bindRun =
  ({ repositories, identities }: TurnStateContext): TurnStore["bindRun"] =>
  async (turn, runId) => {
    const identity = requireIdentity(identities, turn.turnId);
    await repositories.bindTurnRun({
      workspaceId: identity.workspaceId,
      assistantTurnId: turn.turnId,
      runId,
      now: new Date().toISOString(),
    });
  };

const assertRunOwned =
  ({ repositories }: TurnStateContext): TurnStore["assertRunOwned"] =>
  async (auth, conversationId, runId) => {
    const turn = await repositories.findAssistantTurnByRun({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      runId,
    });
    if (!turn || turn.conversationId !== conversationId) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
    }
  };

const assertRunAccessible =
  ({ repositories }: TurnStateContext): TurnRunAccess["assertAccessible"] =>
  async (auth, runId) => {
    const turn = await repositories.findAssistantTurnByRun({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      runId,
    });
    if (!turn) {
      throw new TurnRejectedError(TURN_REJECTION_CODES.RUN_NOT_FOUND, "Turn run not found");
    }
  };

const appendAssistantMessage =
  ({ repositories, identities }: TurnStateContext): MessageStore["appendAssistantMessage"] =>
  async (turn, message) => {
    const identity = requireIdentity(identities, turn.turnId);
    await repositories.appendMessage({
      workspaceId: identity.workspaceId,
      subjectId: identity.subjectId,
      conversationId: turn.conversationId,
      messageId: message.id,
      role: TURN_MESSAGE_ROLES.ASSISTANT,
      parts: [{ type: "text", text: message.text }],
      metadataJson: {},
      now: new Date().toISOString(),
    });
  };

const claimTerminal =
  ({ repositories, identities }: TurnStateContext): TurnStore["claimTerminal"] =>
  async (turn, terminal) => {
    const identity = requireIdentity(identities, turn.turnId);
    // The assistant message is persisted separately via appendAssistantMessage,
    // so the terminal transition never carries a message id.
    const result = await repositories.claimAssistantTurnTerminal({
      workspaceId: identity.workspaceId,
      assistantTurnId: turn.turnId,
      status: terminal.status,
      assistantMessageId: undefined,
      finishReason: terminal.finishReason,
      errorCode: terminal.safeErrorCode,
      usage: {
        inputTokens: terminal.usage.inputTokens,
        outputTokens: terminal.usage.outputTokens,
        totalTokens: terminal.usage.totalTokens,
        reasoningTokens: 0,
        cachedInputTokens: 0,
      },
      now: new Date().toISOString(),
    });
    return result.claimed;
  };

const requireIdentity = (identities: Map<string, TurnIdentity>, turnId: string): TurnIdentity => {
  const identity = identities.get(turnId);
  if (!identity) {
    // A turn we opened is always recorded; a miss is an internal invariant break
    // (a write for a turn this instance never began), not a client error.
    throw new Error(`No recorded identity for turn ${turnId}.`);
  }
  return identity;
};

/** Create-or-get the conversation, mapping a cross-subject id collision to FORBIDDEN. */
const createConversation = async (
  repositories: SidechatRepositories,
  auth: AuthContext,
  conversationId: string,
  now: string,
): Promise<void> => {
  try {
    await repositories.createOrGetConversation({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      actorId: auth.subjectId,
      conversationId,
      conversationKey: conversationId,
      now,
    });
  } catch (error) {
    if (uniqueViolationConstraint(error) === CONVERSATIONS_PRIMARY_KEY_CONSTRAINT) {
      throw new TurnRejectedError(
        TURN_REJECTION_CODES.FORBIDDEN,
        "Conversation belongs to a different subject",
      );
    }
    throw error;
  }
};

/** Open the running turn, mapping the db busy guard to a BUSY rejection. */
const startTurn = async (
  repositories: SidechatRepositories,
  input: BeginTurnInput,
  now: string,
) => {
  const { auth } = input;
  try {
    const started = await repositories.startAssistantTurn({
      workspaceId: auth.workspaceId,
      subjectId: auth.subjectId,
      actorId: auth.subjectId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      userMessageId: input.userMessage.id,
      ...PENDING_PROVENANCE,
      now,
    });
    return started.record;
  } catch (error) {
    if (error instanceof DbRepositoryError && error.code === "conversation_busy") {
      throw busy();
    }
    throw error;
  }
};

const busy = (): TurnRejectedError =>
  new TurnRejectedError(TURN_REJECTION_CODES.BUSY, "Conversation already has a running turn");
