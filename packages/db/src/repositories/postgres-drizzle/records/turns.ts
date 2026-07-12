import { and, eq, isNull, or } from "drizzle-orm";

import { assistantTurns, turnContextSnapshots } from "#drizzle/schema";
import type { RequestId, WorkspaceId } from "#schema-contract";
import type { SidechatRepositories } from "../../contract.js";
import { DbRepositoryError } from "../../errors.js";
import { uniqueViolationConstraint } from "../pg-errors.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import {
  requireSubjectConversation,
  toAssistantTurnRecord,
  toContextSnapshotRecord,
} from "./records.js";
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
  | "startAssistantTurn"
  | "bindTurnRun"
  | "claimAssistantTurnTerminal"
  | "recordTurnContextSnapshot"
  | "findActiveAssistantTurn"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "findAssistantTurnByRun"
  | "listActiveAssistantTurns"
  | "recordUsage"
  | "readUsageSummary"
> => ({
  // Open a running turn. Two unique constraints do the work: a SELECT-first on
  // (workspace_id, request_id) makes a same-request replay idempotent without an
  // insert; the insert then either succeeds, races another same-request insert
  // (converge on it), or hits the one-running-per-conversation partial unique
  // index — the race-safe busy guard — which surfaces as `conversation_busy`.
  startAssistantTurn: async (command) => {
    await requireSubjectConversation(
      db,
      command.workspaceId,
      command.subjectId,
      command.conversationId,
    );

    const priorByRequest = await selectTurnByRequest(db, command.workspaceId, command.requestId);
    if (priorByRequest[0]) return result(toAssistantTurnRecord(priorByRequest[0]), false);

    try {
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
          status: "running",
          startedAt: command.now,
        })
        .returning();
      return result(
        toAssistantTurnRecord(
          one(rows, "record_not_found", "Assistant turn insert returned no row."),
        ),
        true,
      );
    } catch (error) {
      const constraint = uniqueViolationConstraint(error);
      const isRequestConflict = constraint === "assistant_turns_workspace_request_uq";
      const isBusyConflict = constraint === "assistant_turns_one_running_per_conversation_uq";
      if (isRequestConflict || isBusyConflict) {
        // One concurrent insert can violate BOTH indexes; Postgres names only the
        // one it checked first. Resolve by request identity, not by that name: an
        // existing row for this request is a concurrent replay we converge on;
        // without one, the running slot belongs to another turn (busy).
        const raced = await selectTurnByRequest(db, command.workspaceId, command.requestId);
        if (raced[0]) return result(toAssistantTurnRecord(raced[0]), false);
        if (isBusyConflict) {
          throw new DbRepositoryError(
            "conversation_busy",
            "A turn is already running for this conversation.",
          );
        }
        throw new DbRepositoryError(
          "record_not_found",
          "Assistant turn request conflict did not return an existing record.",
        );
      }
      throw error;
    }
  },
  // Bind the durable Workflow run id once the run has started. A replay may set
  // the same id again, but a different id cannot steal an existing binding.
  bindTurnRun: async (command) => {
    const bindRun = async () => {
      try {
        return await db
          .update(assistantTurns)
          .set({ runId: command.runId })
          .where(
            and(
              eq(assistantTurns.workspaceId, command.workspaceId),
              eq(assistantTurns.assistantTurnId, command.assistantTurnId),
              or(isNull(assistantTurns.runId), eq(assistantTurns.runId, command.runId)),
            ),
          )
          .returning();
      } catch (error) {
        // The one-run-per-turn partial unique index rejects binding a run id that
        // already belongs to another turn. Map it to the typed transition error
        // rather than leaking a raw driver error to the port.
        if (uniqueViolationConstraint(error) === "assistant_turns_run_uq") {
          throw new DbRepositoryError(
            "invalid_transition",
            "This Workflow run is already bound to a different turn.",
          );
        }
        throw error;
      }
    };
    const rows = await bindRun();
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
    if (current[0]) {
      throw new DbRepositoryError(
        "invalid_transition",
        "An assistant turn cannot be rebound to a different Workflow run.",
      );
    }
    throw new DbRepositoryError(
      "record_not_found",
      "Assistant turn does not exist in the requested workspace.",
    );
  },
  // The one guarded terminal transition: a single `UPDATE ... WHERE status =
  // 'running'`. A matched row won the transition (`claimed: true`). No match means
  // already-terminal or unknown: an existing terminal row reports `claimed: false`
  // (replay and duplicate finalize are no-ops); no row raises `record_not_found`.
  claimAssistantTurnTerminal: async (command) => {
    const claimed = await db
      .update(assistantTurns)
      .set({
        status: command.status,
        finishReason: optional(command.finishReason),
        errorCode: optional(command.errorCode),
        assistantMessageId: optional(command.assistantMessageId),
        inputTokens: command.usage.inputTokens,
        outputTokens: command.usage.outputTokens,
        totalTokens: command.usage.totalTokens,
        reasoningTokens: command.usage.reasoningTokens,
        cachedInputTokens: command.usage.cachedInputTokens,
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
    if (claimed[0]) return { record: toAssistantTurnRecord(claimed[0]), claimed: true };

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
    return {
      record: toAssistantTurnRecord(
        one(
          current,
          "record_not_found",
          "Assistant turn does not exist in the requested workspace.",
        ),
      ),
      claimed: false,
    };
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
  findAssistantTurn: findAssistantTurn(db),
  findAssistantTurnByRequest: findAssistantTurnByRequest(db),
  findAssistantTurnByRun: findAssistantTurnByRun(db),
  findActiveAssistantTurn: findActiveAssistantTurn(db),
  listActiveAssistantTurns: listActiveAssistantTurns(db),
  recordUsage: recordUsage({ db, ids }),
  readUsageSummary: readUsageSummary({ db, ids }),
});
