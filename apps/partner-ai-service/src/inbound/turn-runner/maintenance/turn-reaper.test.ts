import {
  PROTOCOL_ERROR_CODES,
  SIDECHAT_EVENT_TYPES,
  isTerminalEvent,
  parseSidechatStreamEvent,
  type ProtocolErrorCode,
} from "@side-chat/chat-protocol";
import {
  createMemorySidechatRepositories,
  type AssistantTurnRecord,
  type MemorySidechatRepositories,
  type TurnEventRecord,
} from "@side-chat/db";
import type {
  ObservabilityRecord,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  composePartnerAiService,
  type ResumabilityOptions,
} from "#composition/service-composition";
import type { TurnReaper } from "./turn-reaper.js";

const WORKSPACE: WorkspaceRef = {
  tenantId: "tenant_reaper",
  workspaceId: "workspace_reaper",
};

// An acquire clock far in the past, so any lease the reaper test claims is already
// expired relative to the reaper's real-time sweep clock.
const PAST_NOW = "2020-01-01T00:00:00.000Z";
const LEASE_TTL_MS = 30_000;

describe("turn reaper", () => {
  it("terminalizes an expired-lease running turn exactly once and bumps the epoch", async () => {
    const harness = await createReaperHarness();
    const turnId = await harness.seedExpiredLeaseTurn("request_reaper_1");

    const reapedCount = await harness.reaper.sweepOnce();
    expect(reapedCount).toBeGreaterThanOrEqual(1);

    // The turn is terminal, the epoch advanced past the acquire epoch (1 -> 2), and
    // exactly one synthetic error terminal closes the durable log.
    const turn = harness.requireTurn(turnId);
    expect(turn.status).toBe("provider_failed");
    expect(turn.errorCode).toBe("timeout");
    expect(turn.leaseEpoch).toBe(2);
    const terminals = await harness.terminalEvents(turnId);
    expect(terminals).toHaveLength(1);
    expect(terminalErrorCode(terminals)).toBe(PROTOCOL_ERROR_CODES.TIMEOUT);

    // A second sweep finds the turn no longer running, so it neither reaps nor
    // appends a second terminal.
    const secondCount = await harness.reaper.sweepOnce();
    const stillRunning =
      secondCount === 0 ||
      harness.requireTurn(turnId).status === "provider_failed";
    expect(stillRunning).toBe(true);
    expect(await harness.terminalEvents(turnId)).toHaveLength(1);

    await harness.shutdown();
  });

  it("records a reaped turn with cancel intent as a user_aborted terminal", async () => {
    const harness = await createReaperHarness();
    const turnId = await harness.seedExpiredLeaseTurn("request_reaper_cancel");
    await harness.repositories.requestTurnCancellation({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId: turnId,
      now: PAST_NOW,
    });

    await harness.reaper.sweepOnce();

    const turn = harness.requireTurn(turnId);
    expect(turn.status).toBe("user_aborted");
    expect(turn.errorCode).toBe("aborted");
    const terminals = await harness.terminalEvents(turnId);
    expect(terminals).toHaveLength(1);
    expect(terminalErrorCode(terminals)).toBe(PROTOCOL_ERROR_CODES.ABORTED);

    await harness.shutdown();
  });

  it("does not double-terminalize under concurrent sweeps", async () => {
    const harness = await createReaperHarness();
    const turnId = await harness.seedExpiredLeaseTurn(
      "request_reaper_concurrent",
    );

    // Two sweeps race over the same expired turn; the running-guard CAS lets exactly
    // one reap it, and the partial-unique terminal index keeps the log to one
    // terminal even if both tried to append.
    await Promise.all([harness.reaper.sweepOnce(), harness.reaper.sweepOnce()]);

    expect(await harness.terminalEvents(turnId)).toHaveLength(1);
    expect(harness.requireTurn(turnId).leaseEpoch).toBe(2);

    await harness.shutdown();
  });

  it("bounds one sweep by the configured reaper batch limit", async () => {
    // A batch limit of 1 from config means one sweep terminalizes at most one of the
    // two expired turns; the second drains on the next pass.
    const harness = await createReaperHarness({ reaperBatchLimit: 1 });
    await harness.seedExpiredLeaseTurn("request_reaper_batch_1");
    await harness.seedExpiredLeaseTurn("request_reaper_batch_2");

    expect(await harness.reaper.sweepOnce()).toBe(1);
    expect(await harness.reaper.sweepOnce()).toBe(1);
    expect(await harness.reaper.sweepOnce()).toBe(0);

    await harness.shutdown();
  });

  it("records a turn_reaped observation with count and reason", async () => {
    const records: ObservabilityRecord[] = [];
    const harness = await createReaperHarness(undefined, records);
    const turnId = await harness.seedExpiredLeaseTurn(
      "request_reaper_observed",
    );

    await harness.reaper.sweepOnce();

    const reaped = records.find(
      (record) => record.lifecycleState === "turn_reaped",
    );
    expect(reaped).toMatchObject({ assistantTurnId: turnId });
    expect(reaped?.attributes).toMatchObject({
      reapedCount: 1,
      reason: "lease_expired",
    });

    await harness.shutdown();
  });
});

type ReaperHarness = {
  readonly reaper: TurnReaper;
  readonly repositories: MemorySidechatRepositories;
  readonly seedExpiredLeaseTurn: (requestId: string) => Promise<string>;
  readonly requireTurn: (turnId: string) => AssistantTurnRecord;
  readonly terminalEvents: (
    turnId: string,
  ) => Promise<readonly TurnEventRecord[]>;
  readonly shutdown: () => Promise<void>;
};

const createReaperHarness = async (
  resumability?: ResumabilityOptions,
  observabilityRecords?: ObservabilityRecord[],
): Promise<ReaperHarness> => {
  const repositories = createMemorySidechatRepositories();
  const observability = observabilityRecords
    ? {
        record: (record: ObservabilityRecord) =>
          Effect.sync(() => {
            observabilityRecords.push(record);
          }),
      }
    : undefined;
  const composition = composePartnerAiService({
    workspace: WORKSPACE,
    repositories,
    resumability,
    observability,
  });

  // Create a running turn and claim its lease with a past clock, so the lease is
  // already expired when the reaper sweeps with its real-time clock.
  const seedExpiredLeaseTurn = async (requestId: string): Promise<string> => {
    const conversation = await repositories.createOrGetConversation({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_reaper",
      actorId: "actor_reaper",
      conversationKey: requestId,
      now: PAST_NOW,
    });
    const userMessage = await repositories.appendMessage({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_reaper",
      conversationId: conversation.record.conversationId,
      role: "user",
      contentText: "hello reaper",
      metadataJson: {},
      idempotencyKey: { value: `${requestId}:user` },
      now: PAST_NOW,
    });
    const turn = await repositories.startAssistantTurn({
      workspaceId: WORKSPACE.workspaceId,
      subjectId: "subject_reaper",
      actorId: "actor_reaper",
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
    await repositories.acquireTurnLease({
      workspaceId: WORKSPACE.workspaceId,
      assistantTurnId: turn.record.assistantTurnId,
      ownerInstanceId: "instance_dead",
      leaseTtlMs: LEASE_TTL_MS,
      now: PAST_NOW,
    });
    return turn.record.assistantTurnId;
  };

  return {
    reaper: composition.reaper,
    repositories,
    seedExpiredLeaseTurn,
    requireTurn: (turnId) => {
      const turn = repositories
        .snapshot()
        .assistantTurns.find(
          (candidate) => candidate.assistantTurnId === turnId,
        );
      if (!turn) throw new Error(`Assistant turn ${turnId} was not persisted.`);
      return turn;
    },
    terminalEvents: async (turnId) => {
      const events = await repositories.readTurnEventsAfter({
        workspaceId: WORKSPACE.workspaceId,
        assistantTurnId: turnId,
        after: -1,
      });
      return events.filter((event) =>
        isTerminalEvent(parseSidechatStreamEvent(event.payloadJson)),
      );
    },
    shutdown: composition.shutdown,
  };
};

// Decode a one-terminal slice and narrow it to its error variant to read the
// durable `code`. The reaper only ever closes a turn with an error terminal, so a
// non-error (or absent) terminal is a contract violation worth failing loudly.
const terminalErrorCode = (
  terminals: readonly TurnEventRecord[],
): ProtocolErrorCode => {
  const [only] = terminals;
  if (!only) throw new Error("Expected exactly one terminal event.");
  const event = parseSidechatStreamEvent(only.payloadJson);
  if (event.type !== SIDECHAT_EVENT_TYPES.ERROR) {
    throw new Error(`Expected an error terminal but received ${event.type}.`);
  }
  return event.code;
};
