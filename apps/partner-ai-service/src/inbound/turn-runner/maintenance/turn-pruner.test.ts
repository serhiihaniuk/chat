import { createMemorySidechatRepositories, type MemorySidechatRepositories } from "@side-chat/db";
import type { WorkspaceRef } from "@side-chat/partner-ai-core";
import { describe, expect, it } from "vitest";

import { composePartnerAiService } from "#composition/service-composition";
import type { TurnPruner } from "./turn-pruner.js";

const WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_pruner",
  workspaceId: "workspace_pruner",
};

// A completion instant far in the past, so any terminal turn the test seeds is well
// outside the retention window relative to the pruner's real-time sweep clock.
const PAST_NOW = "2020-01-01T00:00:00.000Z";
// A short retention so the real-time sweep cutoff is still after the seeded
// completion instant: the seeded turns are always prunable.
const RETENTION_MS = 1_000;

describe("turn pruner", () => {
  it("prunes a terminal turn's events but keeps the turn record and assistant message", async () => {
    const harness = await createPrunerHarness();
    const seeded = await harness.seedCompletedTurn("request_pruner_1");

    const prunedCount = await harness.pruner.sweepOnce();
    expect(prunedCount).toBeGreaterThanOrEqual(1);

    // The event log is gone (replay will fall back to history).
    const events = await harness.repositories.readTurnEventsAfter({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId: seeded.assistantTurnId,
      after: -1,
    });
    expect(events).toEqual([]);

    // The consolidated turn record and the assistant message survive.
    const snapshot = harness.repositories.snapshot();
    const turn = snapshot.assistantTurns.find(
      (candidate) => candidate.assistantTurnId === seeded.assistantTurnId,
    );
    expect(turn?.status).toBe("completed");
    expect(turn?.assistantMessageId).toBe(seeded.assistantMessageId);
    expect(
      snapshot.messages.some((message) => message.messageId === seeded.assistantMessageId),
    ).toBe(true);

    await harness.shutdown();
  });

  it("does not prune a still-running turn's events", async () => {
    const harness = await createPrunerHarness();
    const running = await harness.seedRunningTurn("request_pruner_running");

    await harness.pruner.sweepOnce();

    const events = await harness.repositories.readTurnEventsAfter({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId: running.assistantTurnId,
      after: -1,
    });
    expect(events.map((event) => event.sequence)).toEqual([0]);

    await harness.shutdown();
  });
});

type SeededTurn = {
  readonly assistantTurnId: string;
  readonly assistantMessageId: string;
};

type PrunerHarness = {
  readonly pruner: TurnPruner;
  readonly repositories: MemorySidechatRepositories;
  readonly seedCompletedTurn: (requestId: string) => Promise<SeededTurn>;
  readonly seedRunningTurn: (requestId: string) => Promise<SeededTurn>;
  readonly shutdown: () => Promise<void>;
};

const createPrunerHarness = async (): Promise<PrunerHarness> => {
  const repositories = createMemorySidechatRepositories();
  const composition = composePartnerAiService({
    workspace: WORKSPACE,
    repositories,
    resumability: { turnEventRetentionMs: RETENTION_MS },
  });

  const seedTurn = async (requestId: string): Promise<string> => {
    const conversation = await repositories.createOrGetConversation({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_pruner",
      actorId: "actor_pruner",
      conversationKey: requestId,
      now: PAST_NOW,
    });
    const userMessage = await repositories.appendMessage({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_pruner",
      conversationId: conversation.record.conversationId,
      role: "user",
      contentText: "hello pruner",
      metadataJson: {},
      idempotencyKey: { value: `${requestId}:user` },
      now: PAST_NOW,
    });
    const turn = await repositories.startAssistantTurn({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_pruner",
      actorId: "actor_pruner",
      requestId,
      conversationId: conversation.record.conversationId,
      userMessageId: userMessage.record.messageId,
      runtimeProfile: "fake",
      systemPromptVersion: "system_v1",
      contextStrategyVersion: "context_v1",
      toolRegistryVersion: "tools_v1",
      modelProvider: "fake",
      modelId: "fake-model",
      now: PAST_NOW,
    });
    return turn.record.assistantTurnId;
  };

  const appendEvent = (
    assistantTurnId: string,
    sequence: number,
    type: "started" | "delta" | "completed",
    payloadJson: Record<string, unknown>,
  ) =>
    repositories.appendTurnEvent({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId,
      sequence,
      type,
      payloadJson: payloadJson as never,
      now: PAST_NOW,
    });

  const seedRunningTurn = async (requestId: string): Promise<SeededTurn> => {
    const assistantTurnId = await seedTurn(requestId);
    await appendEvent(assistantTurnId, 0, "started", {
      type: "sidechat.started",
      sequence: 0,
    });
    return { assistantTurnId, assistantMessageId: "" };
  };

  const seedCompletedTurn = async (requestId: string): Promise<SeededTurn> => {
    const assistantTurnId = await seedTurn(requestId);
    await appendEvent(assistantTurnId, 0, "started", {
      type: "sidechat.started",
      sequence: 0,
    });
    await appendEvent(assistantTurnId, 1, "delta", { content: "answer" });
    await appendEvent(assistantTurnId, 2, "completed", {
      finishReason: "stop",
    });

    const assistantMessage = await repositories.appendMessage({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_pruner",
      conversationId: (await repositories.findAssistantTurn({
        workspaceId: WORKSPACE.workspaceId,
        assistantTurnId,
      }))!.conversationId,
      role: "assistant",
      contentText: "the answer",
      metadataJson: {},
      idempotencyKey: { value: `${requestId}:assistant` },
      now: PAST_NOW,
    });
    await repositories.completeAssistantTurn({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId,
      assistantMessageId: assistantMessage.record.messageId,
      finishReason: "stop",
      now: PAST_NOW,
    });
    return {
      assistantTurnId,
      assistantMessageId: assistantMessage.record.messageId,
    };
  };

  return {
    pruner: composition.pruner,
    repositories,
    seedCompletedTurn,
    seedRunningTurn,
    shutdown: composition.shutdown,
  };
};
