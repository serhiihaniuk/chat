import type { AssistantTurnRepositoryContract, UsageRecord } from "#schema-contract";
import { omitUndefinedProperties } from "@side-chat/shared";
import type { MemoryRepositoryContext } from "./conversations.js";
import { result } from "../../repository-utils.js";

export const createMemoryUsageRepository = ({
  ids,
  store,
}: MemoryRepositoryContext): Pick<
  AssistantTurnRepositoryContract,
  "recordUsage" | "readUsageSummary"
> => ({
  recordUsage: async (command) => {
    await Promise.resolve();
    const existing = store.usageRecords.find(
      (usage) =>
        usage.workspaceId === command.workspaceId &&
        usage.assistantTurnId === command.assistantTurnId &&
        usage.runtimeStepIndex === command.runtimeStepIndex,
    );
    if (existing) return result(existing, false);

    const usage: UsageRecord = omitUndefinedProperties({
      workspaceId: command.workspaceId,
      usageRecordId: ids.next("usage"),
      assistantTurnId: command.assistantTurnId,
      runtimeStepIndex: command.runtimeStepIndex,
      modelProvider: command.modelProvider,
      modelId: command.modelId,
      providerRequestId: command.providerRequestId,
      inputTokens: command.inputTokens,
      outputTokens: command.outputTokens,
      reasoningTokens: command.reasoningTokens,
      cachedInputTokens: command.cachedInputTokens,
      totalTokens: command.totalTokens,
      costUnits: command.costUnits,
      createdAt: command.now,
      updatedAt: command.now,
    });
    store.usageRecords.push(usage);
    return result(usage, true);
  },
  readUsageSummary: async (command) => {
    await Promise.resolve();
    return store.usageRecords
      .filter((usage) => usage.workspaceId === command.workspaceId)
      .reduce(
        (total, usage) => ({
          inputTokens: total.inputTokens + usage.inputTokens,
          outputTokens: total.outputTokens + usage.outputTokens,
          totalTokens: total.totalTokens + usage.totalTokens,
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      );
  },
});
