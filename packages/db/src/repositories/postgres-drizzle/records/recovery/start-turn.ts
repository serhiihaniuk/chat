import { and, eq } from "drizzle-orm";

import { SIDECHAT_UNIQUE_INDEXES } from "#drizzle/constraint-names";
import { assistantTurns } from "#drizzle/schema";
import type { AssistantTurnRepositoryContract, RequestId, WorkspaceId } from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../../errors.js";
import { one, result } from "../../../repository-utils.js";
import { uniqueViolationConstraint } from "../../pg-errors.js";
import type { PostgresDrizzleRepositoryContext } from "../context.js";
import { requireSubjectConversation, toAssistantTurnRecord } from "../records.js";
import type { TurnRecoveryRepository } from "./turn-recovery.js";

type TurnDb = PostgresDrizzleRepositoryContext["db"];
type StartAssistantTurn = AssistantTurnRepositoryContract["startAssistantTurn"];
type StartCommand = Parameters<StartAssistantTurn>[0];
const DEFAULT_TURN_RECOVERY_GRACE_MS = 60_000;

const selectTurnByRequest = (db: TurnDb, workspaceId: WorkspaceId, requestId: RequestId) =>
  db
    .select()
    .from(assistantTurns)
    .where(
      and(eq(assistantTurns.workspaceId, workspaceId), eq(assistantTurns.requestId, requestId)),
    )
    .limit(1);

/** Open a product turn with idempotency, one-open-turn fencing, and stale repair. */
export function createStartAssistantTurn(
  { db, ids }: PostgresDrizzleRepositoryContext,
  recovery: TurnRecoveryRepository,
): StartAssistantTurn {
  return async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );

    const prior = await selectTurnByRequest(db, command.workspaceId, command.requestId);
    if (prior[0]) return result(toAssistantTurnRecord(prior[0]), false);

    try {
      return await insertAssistantTurn(db, ids, command, "Assistant turn insert returned no row.");
    } catch (error) {
      return await resolveInsertConflict(db, ids, recovery, command, error);
    }
  };
}

async function resolveInsertConflict(
  db: TurnDb,
  ids: PostgresDrizzleRepositoryContext["ids"],
  recovery: TurnRecoveryRepository,
  command: StartCommand,
  error: unknown,
) {
  const constraint = uniqueViolationConstraint(error);
  const requestConflict = constraint === SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_WORKSPACE_REQUEST;
  const busyConflict =
    constraint === SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_ONE_OPEN_PER_CONVERSATION;
  if (!requestConflict && !busyConflict) throw error;

  // Both indexes can race; request identity decides replay versus another turn.
  const raced = await selectTurnByRequest(db, command.workspaceId, command.requestId);
  if (raced[0]) return result(toAssistantTurnRecord(raced[0]), false);
  if (!busyConflict) {
    throw new DbRepositoryError(
      DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
      "Assistant turn request conflict did not return an existing record.",
    );
  }

  const available = await recovery.resolveConversationTurnAvailability({
    workspaceId: command.workspaceId,
    subjectId: command.subjectId,
    conversationId: command.conversationId,
    now: command.now,
    recoveryGraceMs: command.recoveryGraceMs ?? DEFAULT_TURN_RECOVERY_GRACE_MS,
  });
  if (!available) throwConversationBusy();

  try {
    return await insertAssistantTurn(db, ids, command, "Assistant turn retry returned no row.");
  } catch (retryError) {
    if (
      uniqueViolationConstraint(retryError) ===
      SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_ONE_OPEN_PER_CONVERSATION
    ) {
      throwConversationBusy();
    }
    throw retryError;
  }
}

async function insertAssistantTurn(
  db: TurnDb,
  ids: PostgresDrizzleRepositoryContext["ids"],
  command: StartCommand,
  missingMessage: string,
) {
  const rows = await db
    .insert(assistantTurns)
    .values({
      assistantTurnId: ids.next("assistant_turn"),
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
    .returning();
  return result(
    toAssistantTurnRecord(one(rows, DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND, missingMessage)),
    true,
  );
}

function throwConversationBusy(): never {
  throw new DbRepositoryError(
    DB_REPOSITORY_ERROR_CODES.CONVERSATION_BUSY,
    "A turn is already open for this conversation.",
  );
}
