import { and, eq, sql } from "drizzle-orm";

import {
  assistantTurns,
  turnContextSnapshots,
  usageRecords,
} from "#drizzle/schema";
import { TURN_CANCEL_NOTIFY_CHANNEL } from "#schema-contract";
import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import {
  requireRunningTurn,
  requireSubjectConversation,
  toAssistantTurnRecord,
  toContextSnapshotRecord,
  toUsageRecord,
} from "./records.js";
import {
  appendTurnEvent,
  maxTurnEventSequence,
  minTurnEventSequence,
  pruneTurnEventsBefore,
  readTurnEventsAfter,
} from "./turn-events.js";
import {
  findActiveAssistantTurn,
  findAssistantTurn,
  findAssistantTurnByRequest,
} from "./turn-lookups.js";
import { one, optional, result } from "../../repository-utils.js";

export const createPostgresDrizzleTurnRepository = ({
  db,
  ids,
}: PostgresDrizzleRepositoryContext): Pick<
  SidechatRepositories,
  | "appendTurnEvent"
  | "completeAssistantTurn"
  | "failAssistantTurn"
  | "findActiveAssistantTurn"
  | "findAssistantTurn"
  | "findAssistantTurnByRequest"
  | "maxTurnEventSequence"
  | "minTurnEventSequence"
  | "pruneTurnEventsBefore"
  | "readTurnEventsAfter"
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
    const inserted = await db
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
    const rows = await db
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
    return toAssistantTurnRecord(
      one(rows, "invalid_transition", "Assistant turn was not running."),
    );
  },
  failAssistantTurn: async (command) => {
    await requireRunningTurn(db, command.workspaceId, command.assistantTurnId);
    const rows = await db
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
    return toAssistantTurnRecord(
      one(rows, "invalid_transition", "Assistant turn was not running."),
    );
  },
  requestTurnCancellation: async (command) =>
    db.transaction(async (transaction) => {
      // CAS to running: only a live turn can be cancelled, so a finished or
      // unknown turn returns no row and the cancel is a durable no-op. A repeat
      // cancel of an already-cancelled-but-still-running turn re-stamps the intent
      // and re-notifies, which is harmless (the owner interrupts idempotently).
      const rows = await transaction
        .update(assistantTurns)
        .set({ cancelRequestedAt: command.now })
        .where(
          and(
            eq(assistantTurns.workspaceId, command.workspaceId),
            eq(assistantTurns.assistantTurnId, command.assistantTurnId),
            eq(assistantTurns.status, "running"),
          ),
        )
        .returning({ assistantTurnId: assistantTurns.assistantTurnId });
      if (!rows[0]) return { cancelRequested: false };

      // Notify only inside the same transaction as the intent write, so the
      // signal fires on commit and never races ahead of the durable state.
      await transaction.execute(
        sql`select pg_notify(${TURN_CANCEL_NOTIFY_CHANNEL}, ${JSON.stringify({
          assistantTurnId: command.assistantTurnId,
        })})`,
      );
      return { cancelRequested: true };
    }),
  appendTurnEvent: appendTurnEvent(db),
  readTurnEventsAfter: readTurnEventsAfter(db),
  maxTurnEventSequence: maxTurnEventSequence(db),
  minTurnEventSequence: minTurnEventSequence(db),
  pruneTurnEventsBefore: pruneTurnEventsBefore(db),
  findAssistantTurn: findAssistantTurn(db),
  findAssistantTurnByRequest: findAssistantTurnByRequest(db),
  findActiveAssistantTurn: findActiveAssistantTurn(db),
  recordUsage: async (command) => {
    const inserted = await db
      .insert(usageRecords)
      .values({
        usageRecordId: ids.next("usage"),
        assistantTurnId: command.assistantTurnId,
        workspaceId: command.workspaceId,
        runtimeStepIndex: command.runtimeStepIndex,
        modelProvider: command.modelProvider,
        modelId: command.modelId,
        providerRequestId: optional(command.providerRequestId),
        inputTokens: command.inputTokens,
        outputTokens: command.outputTokens,
        reasoningTokens: command.reasoningTokens,
        cachedInputTokens: command.cachedInputTokens,
        totalTokens: command.totalTokens,
        costUnits: command.costUnits,
        createdAt: command.now,
      })
      .onConflictDoNothing({
        target: [usageRecords.assistantTurnId, usageRecords.runtimeStepIndex],
      })
      .returning();
    if (inserted[0]) return result(toUsageRecord(inserted[0]), true);

    const existing = await db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.workspaceId, command.workspaceId),
          eq(usageRecords.assistantTurnId, command.assistantTurnId),
          eq(usageRecords.runtimeStepIndex, command.runtimeStepIndex),
        ),
      )
      .limit(1);
    return result(
      toUsageRecord(
        one(
          existing,
          "record_not_found",
          "Usage conflict did not return an existing record.",
        ),
      ),
      false,
    );
  },
  readUsageSummary: async (command) => {
    const [summary] = await db
      .select({
        inputTokens: sql<number>`coalesce(sum(${usageRecords.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${usageRecords.outputTokens}), 0)`,
        totalTokens: sql<number>`coalesce(sum(${usageRecords.totalTokens}), 0)`,
      })
      .from(usageRecords)
      .where(eq(usageRecords.workspaceId, command.workspaceId));

    return {
      inputTokens: Number(summary?.inputTokens ?? 0),
      outputTokens: Number(summary?.outputTokens ?? 0),
      totalTokens: Number(summary?.totalTokens ?? 0),
    };
  },
});
