import { and, eq, isNull } from "drizzle-orm";

import { SIDECHAT_UNIQUE_INDEXES } from "#drizzle/constraint-names";
import { assistantTurns, turnContextSnapshots } from "#drizzle/schema";
import type { RequestId, WorkspaceId } from "#schema-contract";
import type { SidechatRepositories } from "../../contract.js";
import { DB_REPOSITORY_ERROR_CODES, DbRepositoryError } from "../../errors.js";
import { uniqueViolationConstraint } from "../pg-errors.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import { createFinalizeAssistantTurn } from "./activity/finalize-assistant-turn.js";
import { notifyTurnActivity } from "./activity/turn-activity-notification.js";
import { createBeginAssistantTurn } from "./recovery/begin-turn.js";
import { createTurnRecoveryRepository } from "./recovery/turn-recovery.js";
import { toAssistantTurnRecord, toContextSnapshotRecord } from "./records.js";
import {
  findActiveAssistantTurn,
  findAssistantTurn,
  findAssistantTurnByRequest,
  findAssistantTurnByRun,
  listActiveAssistantTurns,
} from "./turn-lookups.js";
import { readUsageSummary, recordUsage } from "./usage.js";
import { one, optional, result } from "../../repository-utils.js";

type TurnDb = PostgresDrizzleRepositoryContext["db"];

/** Read one turn by its client request id, workspace-scoped. */
const selectTurnByRequest = (db: TurnDb, workspaceId: WorkspaceId, requestId: RequestId) =>
  db
    .select()
    .from(assistantTurns)
    .where(
      and(eq(assistantTurns.workspaceId, workspaceId), eq(assistantTurns.requestId, requestId)),
    )
    .limit(1);

export const createPostgresDrizzleTurnRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  | "beginAssistantTurn"
  | "bindTurnRun"
  | "claimTurnRun"
  | "requestTurnCancellation"
  | "resolveConversationTurnAvailability"
  | "finalizeAssistantTurn"
  | "recordTurnContextSnapshot"
  | "findActiveAssistantTurn"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "findAssistantTurnByRun"
  | "listActiveAssistantTurns"
  | "recordUsage"
  | "readUsageSummary"
> => {
  const recovery = createTurnRecoveryRepository({ db, ids });
  return {
    // Open a product turn. Two unique constraints do the work: a SELECT-first on
    // (workspace_id, request_id) makes a same-request replay idempotent without an
    // insert; the insert then either succeeds, races another same-request insert
    // (converge on it), or hits the one-open-per-conversation partial unique
    // index — the race-safe busy guard — which surfaces as `conversation_busy`.
    beginAssistantTurn: createBeginAssistantTurn({ db, ids }),
    // Bind the durable Workflow run id once the run has started. A replay may set
    // the same id again, but a different id cannot steal an existing binding.
    bindTurnRun: async (command) => {
      let rows: Awaited<ReturnType<typeof selectTurnByRequest>>;
      try {
        rows = await db.transaction(async (transaction) => {
          const updated = await transaction
            .update(assistantTurns)
            .set({ runId: command.runId, runBoundAt: command.now })
            .where(
              and(
                eq(assistantTurns.workspaceId, command.workspaceId),
                eq(assistantTurns.assistantTurnId, command.assistantTurnId),
                eq(assistantTurns.status, "open"),
                isNull(assistantTurns.runId),
                isNull(assistantTurns.cancelRequestedAt),
              ),
            )
            .returning();
          if (updated[0]) {
            await notifyTurnActivity(transaction, updated[0]);
          }
          return updated;
        });
      } catch (error) {
        // The one-run-per-turn partial unique index rejects binding a run id that
        // already belongs to another turn. Map it to the typed transition error.
        if (uniqueViolationConstraint(error) === SIDECHAT_UNIQUE_INDEXES.ASSISTANT_TURNS_RUN) {
          throw new DbRepositoryError(
            DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
            "This Workflow run is already bound to a different turn.",
          );
        }
        throw error;
      }
      if (rows[0]) return toAssistantTurnRecord(rows[0]);

      const current = await db
        .select()
        .from(assistantTurns)
        .where(
          and(
            eq(assistantTurns.workspaceId, command.workspaceId),
            eq(assistantTurns.assistantTurnId, command.assistantTurnId),
          ),
        )
        .limit(1);
      if (current[0]?.runId === command.runId) return toAssistantTurnRecord(current[0]);
      if (current[0]) {
        throw new DbRepositoryError(
          DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION,
          "An assistant turn cannot be rebound to a different Workflow run.",
        );
      }
      throw new DbRepositoryError(
        DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
        "Assistant turn does not exist in the requested workspace.",
      );
    },
    finalizeAssistantTurn: createFinalizeAssistantTurn({ db, ids }),
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
            DB_REPOSITORY_ERROR_CODES.RECORD_NOT_FOUND,
            "Context snapshot conflict did not return an existing record.",
          ),
        ),
        false,
      );
    },
    findAssistantTurn: findAssistantTurn(db),
    findAssistantTurnByRequest: findAssistantTurnByRequest(db),
    findAssistantTurnByRun: findAssistantTurnByRun(db),
    findActiveAssistantTurn: findActiveAssistantTurn(db),
    listActiveAssistantTurns: listActiveAssistantTurns(db),
    recordUsage: recordUsage({ db, ids }),
    readUsageSummary: readUsageSummary({ db, ids }),
    ...recovery,
  };
};
