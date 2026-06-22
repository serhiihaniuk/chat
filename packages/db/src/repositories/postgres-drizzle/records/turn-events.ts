import { and, asc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import {
  assistantTurns,
  turnEvents,
  type sidechatTables,
} from "#drizzle/schema";
import {
  isTurnEventTerminalType,
  TURN_EVENT_TERMINAL_TYPES,
  TURN_EVENTS_NOTIFY_CHANNEL,
  type AppendTurnEventCommand,
  type TurnEventRecord,
} from "#schema-contract";
import type { SidechatRepositories } from "../../contract.js";
import { DbRepositoryError } from "../../errors.js";
import { requireWorkspaceTurn, toTurnEventRecord } from "./records.js";
import { jsonValueEquals, one, result } from "../../repository-utils.js";

type TurnEventDb = NodePgDatabase<typeof sidechatTables>;

export const appendTurnEvent =
  (db: TurnEventDb): SidechatRepositories["appendTurnEvent"] =>
  async (command) => {
    // Stage 1: prove the turn is in this workspace and a second terminal is not
    // being introduced before we attempt the durable write.
    await requireWorkspaceTurn(
      db,
      command.workspaceId,
      command.assistantTurnId,
    );
    await rejectSecondTerminal(db, command);

    // Stage 2: insert and notify atomically; NOTIFY fires only on commit.
    const inserted = await insertTurnEventWithNotify(db, command);
    if (inserted) return result(toTurnEventRecord(inserted), true);

    // Stage 3: the only way insert returns nothing is a sequence PK conflict;
    // reconcile it as idempotent re-append or loud corruption.
    return result(await reconcileTurnEventConflict(db, command), false);
  };

export const readTurnEventsAfter =
  (db: TurnEventDb): SidechatRepositories["readTurnEventsAfter"] =>
  async (command) => {
    await requireWorkspaceTurn(
      db,
      command.workspaceId,
      command.assistantTurnId,
    );
    const rows = await db
      .select()
      .from(turnEvents)
      .where(
        and(
          eq(turnEvents.assistantTurnId, command.assistantTurnId),
          gt(turnEvents.sequence, command.after),
        ),
      )
      .orderBy(asc(turnEvents.sequence));
    return rows.map(toTurnEventRecord);
  };

export const maxTurnEventSequence =
  (db: TurnEventDb): SidechatRepositories["maxTurnEventSequence"] =>
  async (command) => {
    await requireWorkspaceTurn(
      db,
      command.workspaceId,
      command.assistantTurnId,
    );
    const [row] = await db
      .select({ value: sql<number | null>`max(${turnEvents.sequence})` })
      .from(turnEvents)
      .where(eq(turnEvents.assistantTurnId, command.assistantTurnId));
    return row?.value === null || row?.value === undefined
      ? undefined
      : Number(row.value);
  };

export const minTurnEventSequence =
  (db: TurnEventDb): SidechatRepositories["minTurnEventSequence"] =>
  async (command) => {
    await requireWorkspaceTurn(
      db,
      command.workspaceId,
      command.assistantTurnId,
    );
    const [row] = await db
      .select({ value: sql<number | null>`min(${turnEvents.sequence})` })
      .from(turnEvents)
      .where(eq(turnEvents.assistantTurnId, command.assistantTurnId));
    return row?.value === null || row?.value === undefined
      ? undefined
      : Number(row.value);
  };

/**
 * Delete the durable event log of long-terminal turns (retention/pruning).
 *
 * A terminal turn (status no longer `running`) keeps the consolidated assistant
 * message and turn record forever; only its now-redundant `turn_events` rows are
 * retention-bounded. This deletes the rows of every terminal turn completed before
 * the cutoff, bounding one sweep by selecting at most `limit` such turns first so a
 * backlog drains over several passes instead of one unbounded delete. A pruned turn
 * still resolves and falls back to conversation history on resume.
 */
export const pruneTurnEventsBefore =
  (db: TurnEventDb): SidechatRepositories["pruneTurnEventsBefore"] =>
  async (command) => {
    const deleted = await db
      .delete(turnEvents)
      .where(
        sql`${turnEvents.assistantTurnId} in ${prunableTurnIds(command.completedBefore, command.limit)}`,
      )
      .returning({ assistantTurnId: turnEvents.assistantTurnId });

    return {
      prunedTurns: new Set(deleted.map((row) => row.assistantTurnId)).size,
      deletedEvents: deleted.length,
    };
  };

/**
 * Select up to `limit` terminal turns whose retention window has elapsed.
 *
 * A turn is prunable when it is no longer `running` (so the durable status and the
 * consolidated message already won) and its `completed_at` is before the cutoff.
 * Bounding the turn set here is what keeps each delete batched.
 */
const prunableTurnIds = (completedBefore: string, limit: number) =>
  sql`(select ${assistantTurns.assistantTurnId} from ${assistantTurns} where ${and(
    ne(assistantTurns.status, "running"),
    lt(assistantTurns.completedAt, completedBefore),
  )} limit ${limit})`;

/**
 * Guard the one-terminal invariant before a terminal append.
 *
 * The partial unique index is the hard backstop (and catches concurrent
 * racers), but checking first turns the common sequential case into a typed
 * `event_log_conflict` instead of a raw constraint violation. Non-terminal
 * events skip this entirely.
 */
const rejectSecondTerminal = async (
  db: TurnEventDb,
  command: AppendTurnEventCommand,
): Promise<void> => {
  if (!isTurnEventTerminalType(command.type)) return;
  const [terminal] = await db
    .select({ sequence: turnEvents.sequence, type: turnEvents.type })
    .from(turnEvents)
    .where(
      and(
        eq(turnEvents.assistantTurnId, command.assistantTurnId),
        inArray(turnEvents.type, [...TURN_EVENT_TERMINAL_TYPES]),
      ),
    )
    .limit(1);
  // A matching terminal at the same sequence is an idempotent re-append, handled
  // downstream by the PK-conflict path; only a different terminal is a conflict.
  if (terminal && terminal.sequence !== command.sequence) {
    throw new DbRepositoryError(
      "event_log_conflict",
      "A terminal turn event already exists for this turn.",
    );
  }
};

/** Insert one row and signal subscribers in a single transaction. */
const insertTurnEventWithNotify = (
  db: TurnEventDb,
  command: AppendTurnEventCommand,
): Promise<typeof turnEvents.$inferSelect | undefined> =>
  db.transaction(async (transaction) => {
    const [row] = await transaction
      .insert(turnEvents)
      .values({
        assistantTurnId: command.assistantTurnId,
        sequence: command.sequence,
        type: command.type,
        payloadJson: command.payloadJson,
        createdAt: command.now,
      })
      .onConflictDoNothing({
        target: [turnEvents.assistantTurnId, turnEvents.sequence],
      })
      .returning();
    if (!row) return undefined;
    await transaction.execute(
      sql`select pg_notify(${TURN_EVENTS_NOTIFY_CHANNEL}, ${JSON.stringify({
        assistantTurnId: command.assistantTurnId,
        sequence: command.sequence,
      })})`,
    );
    return row;
  });

/**
 * Resolve a sequence PK conflict.
 *
 * An identical re-append is idempotent; a different `(type, payload)` at the same
 * sequence is durable-log corruption and fails loudly.
 */
const reconcileTurnEventConflict = async (
  db: TurnEventDb,
  command: AppendTurnEventCommand,
): Promise<TurnEventRecord> => {
  const existing = toTurnEventRecord(
    one(
      await db
        .select()
        .from(turnEvents)
        .where(
          and(
            eq(turnEvents.assistantTurnId, command.assistantTurnId),
            eq(turnEvents.sequence, command.sequence),
          ),
        )
        .limit(1),
      "record_not_found",
      "Turn-event conflict did not return an existing row.",
    ),
  );
  if (
    existing.type !== command.type ||
    !jsonValueEquals(existing.payloadJson, command.payloadJson)
  ) {
    throw new DbRepositoryError(
      "event_log_conflict",
      "A different turn event already exists at this sequence.",
    );
  }
  return existing;
};
