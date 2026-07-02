import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assistantTurns, type sidechatTables } from "#drizzle/schema";
import {
  TURN_ACTIVITY_NOTIFY_CHANNEL,
  toAssistantTurnId,
  toWorkspaceId,
  type AcquireTurnLeaseCommand,
  type AcquireTurnLeaseResult,
  type AssistantTurnRepositoryContract,
  type ReapExpiredTurnsCommand,
  type ReapedTurn,
  type RenewTurnLeaseCommand,
  type RenewTurnLeaseResult,
} from "#schema-contract";
import { activityNotifyPayload } from "./records.js";

type Db = NodePgDatabase<typeof sidechatTables>;

/**
 * Owner-lease fencing for crash and slow-owner recovery (resumable-streaming
 * plan, "Lease Fencing"). Every operation is a compare-and-set against
 * `assistant_turns`, so the durable status and the monotonic `lease_epoch` move
 * together and a stale owner can never overwrite a turn a newer owner or the
 * reaper already claimed.
 */
export const createPostgresTurnLeaseRepository = (
  db: Db,
): Pick<
  AssistantTurnRepositoryContract,
  "acquireTurnLease" | "renewTurnLease" | "reapExpiredTurns"
> => ({
  acquireTurnLease: (command) => acquireTurnLease(db, command),
  renewTurnLease: (command) => renewTurnLease(db, command),
  reapExpiredTurns: (command) => reapExpiredTurns(db, command),
});

/**
 * Claim the lease for a running turn: take ownership, bump the epoch, set expiry.
 *
 * The CAS matches only a still-running turn in the same workspace, so a finished
 * or unknown turn returns no row (`acquired: false`). The bumped epoch is the
 * fence the owner's heartbeat echoes; a previous owner still holding the old
 * epoch is now stale and its next renew will fail.
 */
const acquireTurnLease = async (
  db: Db,
  command: AcquireTurnLeaseCommand,
): Promise<AcquireTurnLeaseResult> => {
  const rows = await db
    .update(assistantTurns)
    .set({
      ownerInstanceId: command.ownerInstanceId,
      leaseEpoch: sql`${assistantTurns.leaseEpoch} + 1`,
      leaseExpiresAt: leaseExpiry(command.now, command.leaseTtlMs),
    })
    .where(
      and(
        eq(assistantTurns.workspaceId, command.workspaceId),
        eq(assistantTurns.assistantTurnId, command.assistantTurnId),
        eq(assistantTurns.status, "running"),
      ),
    )
    .returning({ leaseEpoch: assistantTurns.leaseEpoch });

  const row = rows[0];
  return row ? { acquired: true, leaseEpoch: row.leaseEpoch } : { acquired: false, leaseEpoch: 0 };
};

/**
 * Heartbeat: extend the lease only while this owner still holds it at its epoch.
 *
 * The owner+epoch clause is the fence check. If the reaper or a new owner bumped
 * the epoch, no row matches and `renewed: false` tells the caller it has been
 * fenced and must interrupt generation so it never double-writes the turn.
 */
const renewTurnLease = async (
  db: Db,
  command: RenewTurnLeaseCommand,
): Promise<RenewTurnLeaseResult> => {
  const rows = await db
    .update(assistantTurns)
    .set({ leaseExpiresAt: leaseExpiry(command.now, command.leaseTtlMs) })
    .where(
      and(
        eq(assistantTurns.workspaceId, command.workspaceId),
        eq(assistantTurns.assistantTurnId, command.assistantTurnId),
        eq(assistantTurns.status, "running"),
        eq(assistantTurns.ownerInstanceId, command.ownerInstanceId),
        eq(assistantTurns.leaseEpoch, command.leaseEpoch),
      ),
    )
    .returning({ assistantTurnId: assistantTurns.assistantTurnId });

  return { renewed: rows.length > 0 };
};

/**
 * Terminalize the running turns whose owner died, fencing their owners.
 *
 * Honest classification rides the durable cancel intent: a turn with
 * `cancel_requested_at` becomes `user_aborted`, otherwise `provider_failed`
 * (timeout) — the same split the abnormal finalizer uses. Bumping the epoch in
 * the same statement fences a slow-but-alive owner. Each reaped turn's
 * `turn_activity` notify fires in the same transaction as its status CAS, so
 * other tabs' "generating" dots clear live instead of on their next snapshot.
 *
 * The update targets only rows a `FOR UPDATE SKIP LOCKED` subquery locked, so two
 * concurrent reaper passes grab disjoint rows and the running-guard means a turn
 * already terminalized by one pass matches no row in the other: a turn is reaped
 * exactly once across passes. `limit` bounds one sweep so a backlog drains over
 * several passes instead of one unbounded transaction.
 */
const reapExpiredTurns = async (
  db: Db,
  command: ReapExpiredTurnsCommand,
): Promise<readonly ReapedTurn[]> => {
  const reaped = await db.transaction(async (transaction) => {
    const rows = await transaction
      .update(assistantTurns)
      .set({
        status: sql`case when ${assistantTurns.cancelRequestedAt} is not null then 'user_aborted' else 'provider_failed' end`,
        errorCode: sql`case when ${assistantTurns.cancelRequestedAt} is not null then 'aborted' else 'timeout' end`,
        leaseEpoch: sql`${assistantTurns.leaseEpoch} + 1`,
        completedAt: command.now,
      })
      .where(sql`${assistantTurns.assistantTurnId} in ${expiredTurnIds(command)}`)
      .returning({
        workspaceId: assistantTurns.workspaceId,
        subjectId: assistantTurns.subjectId,
        conversationId: assistantTurns.conversationId,
        assistantTurnId: assistantTurns.assistantTurnId,
        status: assistantTurns.status,
        cancelRequestedAt: assistantTurns.cancelRequestedAt,
        leaseEpoch: assistantTurns.leaseEpoch,
      });
    for (const row of rows) {
      await transaction.execute(
        sql`select pg_notify(${TURN_ACTIVITY_NOTIFY_CHANNEL}, ${activityNotifyPayload(row)})`,
      );
    }
    return rows;
  });

  return reaped.map((row) => ({
    workspaceId: toWorkspaceId(row.workspaceId),
    assistantTurnId: toAssistantTurnId(row.assistantTurnId),
    cancelRequested: row.cancelRequestedAt !== null,
    leaseEpoch: row.leaseEpoch,
  }));
};

/**
 * Lock up to `limit` dead-owner running turns for this sweep.
 *
 * A dead owner shows up two ways: an acquired lease that expired, or a NULL
 * lease on a turn started before `now - nullLeaseGraceMs` (a crash in the
 * insert-to-acquire window — SQL `lease_expires_at < now` is never true for
 * NULL). `FOR UPDATE SKIP LOCKED` is what makes concurrent reapers safe: each
 * pass locks and claims a disjoint set instead of blocking on or double-reaping
 * the same rows.
 */
const expiredTurnIds = (command: ReapExpiredTurnsCommand) =>
  sql`(select ${assistantTurns.assistantTurnId} from ${assistantTurns} where ${and(
    eq(assistantTurns.status, "running"),
    or(
      lt(assistantTurns.leaseExpiresAt, command.now),
      and(
        isNull(assistantTurns.leaseExpiresAt),
        lt(assistantTurns.startedAt, graceCutoff(command)),
      ),
    ),
  )} limit ${command.limit} for update skip locked)`;

/** The instant a NULL-lease running turn must have started after to survive. */
const graceCutoff = (command: ReapExpiredTurnsCommand): string =>
  new Date(new Date(command.now).getTime() - command.nullLeaseGraceMs).toISOString();

/** Resolve the absolute lease expiry from the injected clock, not `now()`. */
const leaseExpiry = (now: string, leaseTtlMs: number): string =>
  new Date(new Date(now).getTime() + leaseTtlMs).toISOString();
