import type { ObservabilityRecord, ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { createTurnReaper, type TurnReaperDependencies } from "./turn-reaper.js";

const WORKSPACE_ID = "workspace_reaper";
const SUBJECT_ID = "subject_reaper";
const START_NOW = "2026-07-02T00:00:00.000Z";
const NULL_LEASE_GRACE_MS = 60_000;
const PAST_GRACE_NOW = "2026-07-02T00:02:00.000Z";

describe("createTurnReaper", () => {
  it("terminalizes a crashed turn (running, no lease) once its grace elapsed", async () => {
    const repositories = createMemorySidechatRepositories();
    const records: ObservabilityRecord[] = [];
    const turn = await startRunningTurn(repositories, "request_reap_1");
    const reaper = createTurnReaper(reaperDependencies(repositories, PAST_GRACE_NOW, records));

    // Within the grace window (clock at start) nothing is reaped.
    const early = createTurnReaper(reaperDependencies(repositories, START_NOW, records));
    await expect(early.sweepOnce()).resolves.toBe(0);
    await early.shutdown();

    await expect(reaper.sweepOnce()).resolves.toBe(1);
    await reaper.shutdown();

    // The turn is honestly terminal, the ghost active turn is gone, and the reap
    // was recorded for operators.
    await expect(
      repositories.findAssistantTurn({
        workspaceId: WORKSPACE_ID,
        subjectId: SUBJECT_ID,
        assistantTurnId: turn.assistantTurnId,
      }),
    ).resolves.toMatchObject({ status: "provider_failed", errorCode: "timeout" });
    await expect(
      repositories.findActiveAssistantTurn({
        workspaceId: WORKSPACE_ID,
        subjectId: SUBJECT_ID,
        conversationId: turn.conversationId,
      }),
    ).resolves.toBeUndefined();
    expect(records).toContainEqual(
      expect.objectContaining({ lifecycleState: "turn_reaped", errorCode: "timeout" }),
    );
  });

  it("sweeps periodically on its own fiber until shutdown", async () => {
    const repositories = createMemorySidechatRepositories();
    const turn = await startRunningTurn(repositories, "request_reap_2");
    const reaper = createTurnReaper({
      ...reaperDependencies(repositories, PAST_GRACE_NOW, []),
      reaperIntervalMs: 10,
    });

    try {
      await expect
        .poll(async () => {
          const found = await repositories.findAssistantTurn({
            workspaceId: WORKSPACE_ID,
            subjectId: SUBJECT_ID,
            assistantTurnId: turn.assistantTurnId,
          });
          return found?.status;
        })
        .toBe("provider_failed");
    } finally {
      await reaper.shutdown();
    }
  });
});

const reaperDependencies = (
  repositories: MemorySidechatRepositories,
  now: string,
  records: ObservabilityRecord[],
): TurnReaperDependencies => ({
  repositories,
  clock: { now: () => now },
  reaperIntervalMs: 60_000,
  batchLimit: 10,
  nullLeaseGraceMs: NULL_LEASE_GRACE_MS,
  observability: recordingSink(records),
});

const recordingSink = (records: ObservabilityRecord[]): ObservabilitySinkPort => ({
  record: (record) => {
    records.push(record);
    return Effect.succeed(undefined);
  },
});

/** A running turn that never acquired a lease — exactly what a hard crash leaves. */
const startRunningTurn = async (repositories: MemorySidechatRepositories, requestId: string) => {
  const conversation = await repositories.createOrGetConversation({
    workspaceId: WORKSPACE_ID,
    subjectId: SUBJECT_ID,
    actorId: "actor_reaper",
    conversationKey: requestId,
    now: START_NOW,
  });
  const message = await repositories.appendMessage({
    workspaceId: WORKSPACE_ID,
    subjectId: SUBJECT_ID,
    conversationId: conversation.record.conversationId,
    role: "user",
    contentText: "hello",
    metadataJson: {},
    idempotencyKey: { value: `${requestId}:user` },
    now: START_NOW,
  });
  const turn = await repositories.startAssistantTurn({
    workspaceId: WORKSPACE_ID,
    subjectId: SUBJECT_ID,
    actorId: "actor_reaper",
    requestId,
    conversationId: conversation.record.conversationId,
    userMessageId: message.record.messageId,
    runtimeProfile: "fake",
    systemPromptVersion: "system_v1",
    contextStrategyVersion: "context_v1",
    toolRegistryVersion: "tools_v1",
    modelProvider: "fake",
    modelId: "fake-model",
    now: START_NOW,
  });
  return turn.record;
};
