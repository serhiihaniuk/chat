import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { assistantTurns, turnContextSnapshots, type sidechatTables } from "#drizzle/schema";
import { TURN_ACTIVITY_NOTIFY_CHANNEL, TURN_CANCEL_NOTIFY_CHANNEL } from "#schema-contract";
import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import {
  activityNotifyPayload,
  requireRunningTurn,
  requireSubjectConversation,
  toAssistantTurnRecord,
  toContextSnapshotRecord,
} from "./records.js";
import {
  findActiveAssistantTurn,
  findAssistantTurn,
  findAssistantTurnByRequest,
  listActiveAssistantTurns,
} from "./turn-lookups.js";
import { readUsageSummary, recordUsage } from "./usage.js";
import { one, optional, result } from "../../repository-utils.js";

type TurnDb = NodePgDatabase<typeof sidechatTables>;

/**
 * Durable cancel intent + notify in one transaction (module-level to keep the
 * repository factory within its nested-function budget).
 *
 * CAS to running: only a live turn can be cancelled, so a finished or unknown turn
 * returns no row and the cancel is a durable no-op. The notify fires on commit, so
 * the signal never races ahead of the durable intent.
 */
const requestTurnCancellation =
  (db: TurnDb): SidechatRepositories["requestTurnCancellation"] =>
  async (command) =>
    db.transaction(async (transaction) => {
      const rows = await transaction
        .update(assistantTurns)
        .set({ cancelRequestedAt: command.now })
        .where(
          and(
            eq(assistantTurns.workspaceId, command.workspaceId),
            eq(assistantTurns.subjectId, command.subjectId),
            eq(assistantTurns.assistantTurnId, command.assistantTurnId),
            eq(assistantTurns.status, "running"),
          ),
        )
        .returning({ assistantTurnId: assistantTurns.assistantTurnId });
      if (!rows[0]) return { cancelRequested: false };

      await transaction.execute(
        sql`select pg_notify(${TURN_CANCEL_NOTIFY_CHANNEL}, ${JSON.stringify({
          assistantTurnId: command.assistantTurnId,
        })})`,
      );
      return { cancelRequested: true };
    });

export const createPostgresDrizzleTurnRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  | "completeAssistantTurn"
  | "failAssistantTurn"
  | "findActiveAssistantTurn"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "listActiveAssistantTurns"
  | "recordTurnContextSnapshot"
  | "recordUsage"
  | "readUsageSummary"
  | "requestTurnCancellation"
  | "startAssistantTurn"
> => ({
  startAssistantTurn: async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );
    // Insert + activity notify in one transaction so the "running" signal fires
    // only on commit. A conflict (idempotent re-create) inserts nothing and skips
    // the notify — the turn already signalled on its first insert.
    const inserted = await db.transaction(async (transaction) => {
      const rows = await transaction
        .insert(assistantTurns)
        .values({
          assistantTurnId: ids.next("assistant_turn"),
          requestId: command.requestId,
          conversationId: command.conversationId,
          workspaceId: command.workspaceId,
          subjectId: command.subjectId,
          actorId: command.actorId,
          userMessageId: command.userMessageId,
          runtimeProfile: command.runtimeProfile,
          systemPromptVersion: command.systemPromptVersion,
          contextStrategyVersion: command.contextStrategyVersion,
          toolRegistryVersion: command.toolRegistryVersion,
          modelProvider: command.modelProvider,
          modelId: command.modelId,
          status: "running",
          startedAt: command.now,
        })
        .onConflictDoNothing({
          target: [assistantTurns.workspaceId, assistantTurns.requestId],
        })
        .returning();
      if (rows[0]) {
        await transaction.execute(
          sql`select pg_notify(${TURN_ACTIVITY_NOTIFY_CHANNEL}, ${activityNotifyPayload(rows[0])})`,
        );
      }
      return rows;
    });
    if (inserted[0]) return result(toAssistantTurnRecord(inserted[0]), true);

    const existing = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.requestId, command.requestId),
        ),
      )
      .limit(1);
    return result(
      toAssistantTurnRecord(
        one(
          existing,
          "record_not_found",
          "Assistant turn conflict did not return an existing record.",
        ),
      ),
      false,
    );
  },
  recordTurnContextSnapshot: async (command) => {
    const inserted = await db
      .insert(turnContextSnapshots)
      .values({
        contextSnapshotId: ids.next("context_snapshot"),
        assistantTurnId: command.assistantTurnId,
        workspaceId: command.workspaceId,
        contextSchemaVersion: command.contextSchemaVersion,
        hostSurfaceId: optional(command.hostSurfaceId),
        hostContextHash: command.hostContextHash,
        capabilitiesHash: command.capabilitiesHash,
        contextRedactedJson: command.contextRedactedJson,
        createdAt: command.now,
      })
      .onConflictDoNothing({
        target: [turnContextSnapshots.assistantTurnId],
      })
      .returning();
    if (inserted[0]) return result(toContextSnapshotRecord(inserted[0]), true);

    const existing = await db
      .select()
      .from(turnContextSnapshots)
      .where(
        and(
          eq(turnContextSnapshots.workspaceId, command.workspaceId),
          eq(turnContextSnapshots.assistantTurnId, command.assistantTurnId),
        ),
      )
      .limit(1);
    return result(
      toContextSnapshotRecord(
        one(
          existing,
          "record_not_found",
          "Context snapshot conflict did not return an existing record.",
        ),
      ),
      false,
    );
  },
  completeAssistantTurn: async (command) => {
    await requireRunningTurn(db, command.workspaceId, command.assistantTurnId);
    const rows = await db.transaction(async (transaction) => {
      const updated = await transaction
        .update(assistantTurns)
        .set({
          status: "completed",
          assistantMessageId: command.assistantMessageId,
          finishReason: command.finishReason,
          completedAt: command.now,
        })
        .where(
          and(
            eq(assistantTurns.workspaceId, command.workspaceId),
            eq(assistantTurns.assistantTurnId, command.assistantTurnId),
            eq(assistantTurns.status, "running"),
          ),
        )
        .returning();
      if (updated[0]) {
        await transaction.execute(
          sql`select pg_notify(${TURN_ACTIVITY_NOTIFY_CHANNEL}, ${activityNotifyPayload(updated[0])})`,
        );
      }
      return updated;
    });
    return toAssistantTurnRecord(
      one(rows, "invalid_transition", "Assistant turn was not running."),
    );
  },
  failAssistantTurn: async (command) => {
    await requireRunningTurn(db, command.workspaceId, command.assistantTurnId);
    const rows = await db.transaction(async (transaction) => {
      const updated = await transaction
        .update(assistantTurns)
        .set({
          status: command.status,
          errorCode: command.errorCode,
          completedAt: command.now,
        })
        .where(
          and(
            eq(assistantTurns.workspaceId, command.workspaceId),
            eq(assistantTurns.assistantTurnId, command.assistantTurnId),
            eq(assistantTurns.status, "running"),
          ),
        )
        .returning();
      if (updated[0]) {
        await transaction.execute(
          sql`select pg_notify(${TURN_ACTIVITY_NOTIFY_CHANNEL}, ${activityNotifyPayload(updated[0])})`,
        );
      }
      return updated;
    });
    return toAssistantTurnRecord(
      one(rows, "invalid_transition", "Assistant turn was not running."),
    );
  },
  requestTurnCancellation: requestTurnCancellation(db),
  findAssistantTurn: findAssistantTurn(db),
  findAssistantTurnByRequest: findAssistantTurnByRequest(db),
  findActiveAssistantTurn: findActiveAssistantTurn(db),
  listActiveAssistantTurns: listActiveAssistantTurns(db),
  recordUsage: recordUsage({ db, ids }),
  readUsageSummary: readUsageSummary({ db, ids }),
});
