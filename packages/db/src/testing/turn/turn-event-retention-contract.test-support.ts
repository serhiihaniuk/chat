import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import {
  closeIfNeeded,
  now,
  startTurn,
  workspaceId,
} from "../repository-contract.helpers.js";

// A fixed completion instant plus a cutoff after it makes "the retention window
// elapsed" deterministic for the prune contract, independent of wall-clock time.
const TURN_COMPLETED_AT = "2026-06-21T00:00:00.000Z";
const AFTER_RETENTION = "2026-06-22T00:00:00.000Z";

/**
 * Shared turn_events retention/pruning contract for both repository adapters.
 *
 * Both the memory and Postgres adapters run it so they prune identically: a
 * finished turn's events are deleted once its completion is older than the cutoff,
 * the turn record and its assistant message are left in place, and a turn that is
 * still running is never selected.
 */
export const turnEventRetentionContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () =>
    `${label.replace(/\W+/gu, "_")}_retention_${++scopeCounter}`;

  describe("turn-event retention contract", () => {
    it("prunes a long-terminal turn's events while keeping the turn record", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const appendEvent = (
          sequence: number,
          type: string,
          payloadJson: Record<string, unknown>,
        ) =>
          repositories.appendTurnEvent({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            sequence,
            type: type as never,
            payloadJson: payloadJson as never,
            now,
          });
        await appendEvent(0, "started", {
          type: "sidechat.started",
          sequence: 0,
        });
        await appendEvent(1, "delta", { content: "hi" });
        await appendEvent(2, "completed", { finishReason: "stop" });

        // Terminalize the turn at a fixed completion instant.
        await repositories.completeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          assistantMessageId: turn.userMessageId,
          finishReason: "stop",
          now: TURN_COMPLETED_AT,
        });

        // A cutoff before completion prunes nothing: the retention window is intact.
        await expect(
          repositories.pruneTurnEventsBefore({
            completedBefore: TURN_COMPLETED_AT,
            limit: 10,
          }),
        ).resolves.toEqual({ prunedTurns: 0, deletedEvents: 0 });

        // A cutoff after completion deletes every event row for the turn.
        const pruned = await repositories.pruneTurnEventsBefore({
          completedBefore: AFTER_RETENTION,
          limit: 10,
        });
        expect(pruned.prunedTurns).toBe(1);
        expect(pruned.deletedEvents).toBe(3);

        // The event log is gone, but the consolidated turn record (and its assistant
        // message) survive, so the turn still resolves and falls back to history.
        await expect(
          repositories.readTurnEventsAfter({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            after: -1,
          }),
        ).resolves.toEqual([]);
        await expect(
          repositories.minTurnEventSequence({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBeUndefined();
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({
          assistantTurnId: turn.assistantTurnId,
          status: "completed",
        });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("does not prune a still-running turn's events", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        await repositories.appendTurnEvent({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          sequence: 0,
          type: "started" as never,
          payloadJson: { type: "sidechat.started", sequence: 0 } as never,
          now,
        });

        // A running turn has no completion instant, so retention never selects it.
        await expect(
          repositories.pruneTurnEventsBefore({
            completedBefore: AFTER_RETENTION,
            limit: 10,
          }),
        ).resolves.toEqual({ prunedTurns: 0, deletedEvents: 0 });
        await expect(
          repositories.minTurnEventSequence({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBe(0);
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
