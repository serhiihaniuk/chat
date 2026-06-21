import { and, eq, sql } from "drizzle-orm";

import { assistantTurns, turnContextSnapshots, usageRecords } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import {
  requireRunningTurn,
  requireSubjectConversation,
  toAssistantTurnRecord,
  toContextSnapshotRecord,
  toUsageRecord,
} from "./records.js";
import { appendTurnEvent, maxTurnEventSequence, readTurnEventsAfter } from "./turn-events.js";
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
  | "readTurnEventsAfter"
  | "recordTurnContextSnapshot"
  | "recordUsage"
  | "readUsageSummary"
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
  appendTurnEvent: appendTurnEvent(db),
  readTurnEventsAfter: readTurnEventsAfter(db),
  maxTurnEventSequence: maxTurnEventSequence(db),
  findAssistantTurn: async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.assistantTurnId, command.assistantTurnId),
        ),
      )
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  },
  findAssistantTurnByRequest: async (command) => {
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.requestId, command.requestId),
        ),
      )
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  },
  findActiveAssistantTurn: async (command) => {
    // The most recently started running turn is the one a reconnect resumes; a
    // conversation should only ever have one, but ordering keeps this stable.
    const rows = await db
      .select()
      .from(assistantTurns)
      .where(
        and(
          eq(assistantTurns.workspaceId, command.workspaceId),
          eq(assistantTurns.subjectId, command.subjectId),
          eq(assistantTurns.conversationId, command.conversationId),
          eq(assistantTurns.status, "running"),
        ),
      )
      .orderBy(sql`${assistantTurns.startedAt} desc`)
      .limit(1);
    return rows[0] ? toAssistantTurnRecord(rows[0]) : undefined;
  },
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
        one(existing, "record_not_found", "Usage conflict did not return an existing record."),
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
