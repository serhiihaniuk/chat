import { isDeepStrictEqual } from "node:util";

import { and, eq } from "drizzle-orm";

import { SIDECHAT_UNIQUE_INDEXES } from "#drizzle/constraint-names";
import { assistantTurns, conversations, messages } from "#drizzle/schema";
import type {
  AssistantTurnRepositoryContract,
  BeginAssistantTurnCommand,
  BeginAssistantTurnResult,
} from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../../errors.js";
import { one } from "../../../repository-utils.js";
import { uniqueViolationConstraint } from "../../pg-errors.js";
import type { PostgresDrizzleRepositoryContext, PostgresDrizzleTransaction } from "../context.js";
import { insertConversationMessageInTransaction } from "../conversations.js";
import { toAssistantTurnRecord, toConversationRecord, toMessageRecord } from "../records.js";
import { resolveConversationTurnAvailabilityInTransaction } from "./turn-recovery.js";

type BeginAssistantTurn = AssistantTurnRepositoryContract["beginAssistantTurn"];
const DEFAULT_TURN_RECOVERY_GRACE_MS = 60_000;
const CONVERSATIONS_PRIMARY_KEY_CONSTRAINT = "conversations_pkey";

/**
 * Accept a user request as one database aggregate.
 *
 * The conversation row is the per-conversation serialization lock. Any error
 * after that lock rolls back conversation creation, message append, stale-turn
 * repair, and turn insertion together. Request-identity races are re-read only
 * after the losing transaction has rolled back.
 */
export function createBeginAssistantTurn(
  context: PostgresDrizzleRepositoryContext,
): BeginAssistantTurn {
  return async (command) => {
    try {
      return await context.db.transaction((transaction) =>
        beginAssistantTurnInTransaction(transaction, context, command),
      );
    } catch (error) {
      return resolveBeginConflict(context, command, error);
    }
  };
}

async function beginAssistantTurnInTransaction(
  transaction: PostgresDrizzleTransaction,
  context: PostgresDrizzleRepositoryContext,
  command: BeginAssistantTurnCommand,
): Promise<BeginAssistantTurnResult> {
  const prior = await selectTurnByRequest(transaction, command);
  if (prior) return resolveReplay(transaction, command, prior);

  const conversation = await createOrRequireConversation(transaction, command);
  await lockConversation(transaction, command);

  // The lock may have waited behind a winning request. Re-read at READ COMMITTED
  // before appending anything so an exact retry returns the winner directly.
  const winner = await selectTurnByRequest(transaction, command);
  if (winner) return resolveReplay(transaction, command, winner);

  const available = await resolveConversationTurnAvailabilityInTransaction(transaction, {
    workspaceId: command.workspaceId,
    subjectId: command.subjectId,
    conversationId: command.conversationId,
    now: command.now,
    recoveryGraceMs: command.recoveryGraceMs ?? DEFAULT_TURN_RECOVERY_GRACE_MS,
  });
  if (!available) throwConversationBusy();

  const message = await insertConversationMessageInTransaction(transaction, {
    workspaceId: command.workspaceId,
    subjectId: command.subjectId,
    conversationId: command.conversationId,
    messageId: command.userMessage.messageId,
    role: command.userMessage.role,
    parts: command.userMessage.parts,
    metadataJson: command.userMessage.metadataJson,
    now: command.now,
  });
  if (!message) throwIdempotencyConflict();

  const turn = one(
    await transaction
      .insert(assistantTurns)
      .values({
        assistantTurnId: context.ids.next("assistant_turn"),
        requestId: command.requestId,
        conversationId: command.conversationId,
        workspaceId: command.workspaceId,
        subjectId: command.subjectId,
        actorId: command.actorId,
        userMessageId: command.userMessageId,
        modelProvider: command.modelProvider,
        modelId: command.modelId,
        instructionsVersion: command.instructionsVersion,
        configVersion: command.configVersion,
        contentFilterVersion: command.contentFilterVersion,
        status: "open",
        startedAt: command.now,
      })
      .returning(),
    DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
    "Assistant turn insert returned no row.",
  );

  return {
    conversation,
    userMessage: toMessageRecord(message),
    turn: toAssistantTurnRecord(turn),
    inserted: true,
  };
}

async function createOrRequireConversation(
  transaction: PostgresDrizzleTransaction,
  command: BeginAssistantTurnCommand,
) {
  const existing = await selectConversation(transaction, command);
  if (existing) return toConversationRecord(existing);

  const inserted = await transaction
    .insert(conversations)
    .values({
      conversationId: command.conversationId,
      workspaceId: command.workspaceId,
      subjectId: command.subjectId,
      conversationKey: command.conversationKey,
      status: "active",
      createdByActorId: command.actorId,
      createdAt: command.now,
      updatedAt: command.now,
      lastMessageAt: command.now,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return toConversationRecord(inserted[0]);

  const raced = await selectConversation(transaction, command);
  if (raced) return toConversationRecord(raced);
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.CROSS_TENANT_ACCESS_DENIED,
    "Conversation belongs to a different owner.",
  );
}

async function lockConversation(
  transaction: PostgresDrizzleTransaction,
  command: BeginAssistantTurnCommand,
): Promise<void> {
  one(
    await transaction
      .select({ conversationId: conversations.conversationId })
      .from(conversations)
      .where(conversationIdentity(command))
      .limit(1)
      .for("update"),
    DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
    "Conversation disappeared before turn admission.",
  );
}

const selectConversation = (
  transaction: PostgresDrizzleTransaction,
  command: BeginAssistantTurnCommand,
) =>
  transaction
    .select()
    .from(conversations)
    .where(conversationIdentity(command))
    .limit(1)
    .then((rows) => rows[0]);

const conversationIdentity = (command: BeginAssistantTurnCommand) =>
  and(
    eq(conversations.workspaceId, command.workspaceId),
    eq(conversations.subjectId, command.subjectId),
    eq(conversations.conversationId, command.conversationId),
  );

const selectTurnByRequest = async (
  transaction: PostgresDrizzleTransaction,
  command: Pick<BeginAssistantTurnCommand, "workspaceId" | "requestId">,
) => {
  const rows = await transaction
    .select()
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.workspaceId, command.workspaceId),
        eq(assistantTurns.requestId, command.requestId),
      ),
    )
    .limit(1);
  return rows[0];
};

async function resolveReplay(
  transaction: PostgresDrizzleTransaction,
  command: BeginAssistantTurnCommand,
  turn: typeof assistantTurns.$inferSelect,
): Promise<BeginAssistantTurnResult> {
  const [conversation] = await transaction
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, turn.workspaceId),
        eq(conversations.subjectId, turn.subjectId),
        eq(conversations.conversationId, turn.conversationId),
      ),
    )
    .limit(1);
  const [message] = await transaction
    .select()
    .from(messages)
    .where(
      and(eq(messages.workspaceId, turn.workspaceId), eq(messages.messageId, turn.userMessageId)),
    )
    .limit(1);

  if (!conversation || !message || !sameReplayIdentity(command, turn, message)) {
    throwIdempotencyConflict();
  }
  return {
    conversation: toConversationRecord(conversation),
    userMessage: toMessageRecord(message),
    turn: toAssistantTurnRecord(turn),
    inserted: false,
  };
}

function sameReplayIdentity(
  command: BeginAssistantTurnCommand,
  turn: typeof assistantTurns.$inferSelect,
  message: typeof messages.$inferSelect,
): boolean {
  return (
    turn.subjectId === command.subjectId &&
    turn.actorId === command.actorId &&
    turn.conversationId === command.conversationId &&
    turn.userMessageId === command.userMessageId &&
    String(command.userMessage.messageId) === String(command.userMessageId) &&
    message.conversationId === command.conversationId &&
    message.role === command.userMessage.role &&
    isDeepStrictEqual(message.parts, command.userMessage.parts) &&
    isDeepStrictEqual(message.metadataJson, command.userMessage.metadataJson)
  );
}

async function resolveBeginConflict(
  context: PostgresDrizzleRepositoryContext,
  command: BeginAssistantTurnCommand,
  error: unknown,
): Promise<BeginAssistantTurnResult> {
  const constraint = uniqueViolationConstraint(error);
  if (constraint === SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_ONE_OPEN_PER_CONVERSATION) {
    throwConversationBusy();
  }
  if (constraint === CONVERSATIONS_PRIMARY_KEY_CONSTRAINT) {
    throw new DbRepositoryError(
      DB_REPOSITORY_ERROR_CODES.CROSS_TENANT_ACCESS_DENIED,
      "Conversation belongs to a different owner.",
    );
  }
  if (constraint !== SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_WORKSPACE_REQUEST) throw error;

  return context.db.transaction(async (transaction) => {
    const winner = await selectTurnByRequest(transaction, command);
    if (!winner) {
      throw new DbRepositoryError(
        DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
        "Assistant turn request conflict returned no canonical row.",
      );
    }
    return resolveReplay(transaction, command, winner);
  });
}

function throwConversationBusy(): never {
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.CONVERSATION_BUSY,
    "A turn is already open for this conversation.",
  );
}

function throwIdempotencyConflict(): never {
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.IDEMPOTENCY_CONFLICT,
    "The request id was already used for a different turn request.",
  );
}
