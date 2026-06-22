import { and, eq, sql } from "drizzle-orm";

import { usageRecords } from "#drizzle/schema";
import type { SidechatRepositories } from "../../contract.js";
import type { PostgresDrizzleRepositoryContext } from "./context.js";
import { toUsageRecord } from "./records.js";
import { one, optional, result } from "../../repository-utils.js";

/** Insert one usage record per (turn, runtime step); idempotent on conflict. */
export const recordUsage =
  ({ db, ids }: PostgresDrizzleRepositoryContext): SidechatRepositories["recordUsage"] =>
  async (command) => {
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
  };

/** Sum token usage across a workspace. */
export const readUsageSummary =
  ({ db }: PostgresDrizzleRepositoryContext): SidechatRepositories["readUsageSummary"] =>
  async (command) => {
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
  };
