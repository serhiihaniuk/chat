import { and, eq, isNull } from "drizzle-orm";

import { assistantTurns } from "#drizzle/schema";
import {
  TURN_CANCELLATION_DISPOSITIONS,
  type AssistantTurnRecord,
  type AssistantTurnRepositoryContract,
} from "#schema-contract";
import { DB_REPOSITORY_ERROR_CODES } from "../../../errors.js";
import { one } from "../../../repository-utils.js";
import type { PostgresDrizzleRepositoryContext, PostgresDrizzleTransaction } from "../context.js";
import { notifyTurnActivity } from "../activity/turn-activity-notification.js";
import { toAssistantTurnRecord } from "../records.js";
import {
  isActiveWorkflowRunStatus,
  isTerminalWorkflowRunStatus,
  workflowRunsRead,
} from "../../workflow/schema.js";

const TURN_RECOVERY_ERROR_CODE = "workflow_failed";

type OpenTurnObservation = Readonly<{
  turn: typeof assistantTurns.$inferSelect;
  workflowStatus: string | null;
}>;

export type TurnRecoveryRepository = Pick<
  AssistantTurnRepositoryContract,
  "claimTurnRun" | "requestTurnCancellation" | "resolveConversationTurnAvailability"
>;

/**
 * Resolve the product/Workflow split at the database boundary.
 *
 * Every mutating branch locks the product row. Workflow lifecycle remains
 * read-only; product terminalization is the fence that a late run must pass
 * before provider execution.
 */
export function createTurnRecoveryRepository({
  db,
}: PostgresDrizzleRepositoryContext): TurnRecoveryRepository {
  return {
    claimTurnRun: (command) =>
      db.transaction(async (transaction) => {
        const current = await selectOwnedTurnForUpdate(transaction, command);
        if (
          current.status !== "open" ||
          current.cancelRequestedAt !== null ||
          (current.runId !== null && current.runId !== command.runId)
        ) {
          return { record: toAssistantTurnRecord(current), claimed: false };
        }
        if (current.runId === command.runId) {
          return { record: toAssistantTurnRecord(current), claimed: true };
        }

        const claimed = one(
          await transaction
            .update(assistantTurns)
            .set({ runId: command.runId, runBoundAt: command.now })
            .where(
              and(
                eq(assistantTurns.workspaceId, command.workspaceId),
                eq(assistantTurns.subjectId, command.subjectId),
                eq(assistantTurns.conversationId, command.conversationId),
                eq(assistantTurns.assistantTurnId, command.assistantTurnId),
                eq(assistantTurns.status, "open"),
                isNull(assistantTurns.runId),
                isNull(assistantTurns.cancelRequestedAt),
              ),
            )
            .returning(),
          DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
          "Assistant turn lost its execution claim while locked.",
        );
        await notifyTurnActivity(transaction, activityRow(claimed, "running"));
        return { record: toAssistantTurnRecord(claimed), claimed: true };
      }),

    resolveConversationTurnAvailability: (command) =>
      db.transaction(async (transaction) => {
        const observation = await selectOpenConversationTurnForUpdate(transaction, command);
        if (!observation) return true;
        if (isActiveWorkflowRunStatus(observation.workflowStatus)) return false;
        if (isTerminalWorkflowRunStatus(observation.workflowStatus)) {
          await terminalizeOpenTurn(transaction, observation.turn, "failed", command.now);
          return true;
        }
        if (!recoveryGraceExpired(observation, command.now, command.recoveryGraceMs)) {
          return false;
        }
        await terminalizeOpenTurn(transaction, observation.turn, "failed", command.now);
        return true;
      }),

    requestTurnCancellation: (command) =>
      db.transaction(async (transaction) => {
        const observation = await selectOwnedRunForUpdate(transaction, command);
        if (observation.turn.status !== "open") {
          return TURN_CANCELLATION_DISPOSITIONS.ACKNOWLEDGED;
        }

        const requested = one(
          await transaction
            .update(assistantTurns)
            .set({ cancelRequestedAt: observation.turn.cancelRequestedAt ?? command.now })
            .where(
              and(
                eq(assistantTurns.workspaceId, command.workspaceId),
                eq(assistantTurns.assistantTurnId, observation.turn.assistantTurnId),
                eq(assistantTurns.status, "open"),
              ),
            )
            .returning(),
          DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
          "Assistant turn lost its cancellation claim while locked.",
        );
        if (isActiveWorkflowRunStatus(observation.workflowStatus)) {
          return TURN_CANCELLATION_DISPOSITIONS.DELIVER;
        }

        const terminalStatus =
          observation.workflowStatus === null || observation.workflowStatus === "cancelled"
            ? "cancelled"
            : "failed";
        await terminalizeOpenTurn(transaction, requested, terminalStatus, command.now);
        return TURN_CANCELLATION_DISPOSITIONS.ACKNOWLEDGED;
      }),
  };
}

async function selectOwnedTurnForUpdate(
  transaction: PostgresDrizzleTransaction,
  command: {
    readonly workspaceId: string;
    readonly subjectId: string;
    readonly conversationId: string;
    readonly assistantTurnId: string;
  },
) {
  return one(
    await transaction
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.conversationId, command.conversationId),
          eq(assistantTurns.assistantTurnId, command.assistantTurnId),
        ),
      )
      .limit(1)
      .for("update"),
    DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
    "Assistant turn does not exist for the requested owner.",
  );
}

async function selectOpenConversationTurnForUpdate(
  transaction: PostgresDrizzleTransaction,
  command: {
    readonly workspaceId: string;
    readonly subjectId: string;
    readonly conversationId: string;
  },
): Promise<OpenTurnObservation | undefined> {
  const rows = await transaction
    .select()
    .from(assistantTurns)
    .where(
      and(
        eq(assistantTurns.workspaceId, command.workspaceId),
        eq(assistantTurns.subjectId, command.subjectId),
        eq(assistantTurns.conversationId, command.conversationId),
        eq(assistantTurns.status, "open"),
      ),
    )
    .limit(1)
    .for("update");
  const turn = rows[0];
  if (!turn) return undefined;
  return { turn, workflowStatus: await readWorkflowStatus(transaction, turn.runId) };
}

async function selectOwnedRunForUpdate(
  transaction: PostgresDrizzleTransaction,
  command: {
    readonly workspaceId: string;
    readonly subjectId: string;
    readonly conversationId: string;
    readonly runId: string;
  },
): Promise<OpenTurnObservation> {
  const turn = one(
    await transaction
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.conversationId, command.conversationId),
          eq(assistantTurns.runId, command.runId),
        ),
      )
      .limit(1)
      .for("update"),
    DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
    "Assistant turn run does not exist for the requested owner.",
  );
  return { turn, workflowStatus: await readWorkflowStatus(transaction, turn.runId) };
}

async function readWorkflowStatus(
  transaction: PostgresDrizzleTransaction,
  runId: string | null,
): Promise<string | null> {
  if (runId === null) return null;
  const rows = await transaction
    .select({ status: workflowRunsRead.status })
    .from(workflowRunsRead)
    .where(eq(workflowRunsRead.id, runId))
    .limit(1);
  return rows[0]?.status ?? null;
}

function recoveryGraceExpired(
  observation: OpenTurnObservation,
  now: string,
  recoveryGraceMs: number,
): boolean {
  const observedAt = observation.turn.runBoundAt ?? observation.turn.startedAt;
  return Date.parse(now) - Date.parse(observedAt) >= recoveryGraceMs;
}

async function terminalizeOpenTurn(
  transaction: PostgresDrizzleTransaction,
  turn: typeof assistantTurns.$inferSelect,
  status: "failed" | "cancelled",
  now: string,
): Promise<AssistantTurnRecord> {
  const terminal = one(
    await transaction
      .update(assistantTurns)
      .set({
        status,
        completedAt: now,
        errorCode: status === "failed" ? TURN_RECOVERY_ERROR_CODE : null,
      })
      .where(
        and(
          eq(assistantTurns.workspaceId, turn.workspaceId),
          eq(assistantTurns.assistantTurnId, turn.assistantTurnId),
          eq(assistantTurns.status, "open"),
        ),
      )
      .returning(),
    DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
    "Assistant turn lost its recovery claim while locked.",
  );
  await notifyTurnActivity(transaction, terminal);
  return toAssistantTurnRecord(terminal);
}

function activityRow(
  row: typeof assistantTurns.$inferSelect,
  status: string,
): Readonly<{
  workspaceId: string;
  subjectId: string;
  conversationId: string;
  assistantTurnId: string;
  status: string;
}> {
  return {
    workspaceId: row.workspaceId,
    subjectId: row.subjectId,
    conversationId: row.conversationId,
    assistantTurnId: row.assistantTurnId,
    status,
  };
}
