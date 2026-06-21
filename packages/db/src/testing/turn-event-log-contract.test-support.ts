import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import {
  closeIfNeeded,
  now,
  startTurn,
  subjectId,
  workspaceId,
} from "./repository-contract.helpers.js";

export const turnEventLogRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_events_${++scopeCounter}`;

  describe("durable turn-event log contract", () => {
    it("appends, replays, and de-duplicates the durable turn-event log", async () => {
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

        const started = await appendEvent(0, "started", { type: "sidechat.started", sequence: 0 });
        const firstDelta = await appendEvent(1, "delta", { content: "he" });
        await appendEvent(2, "delta", { content: "llo" });

        expect(started.inserted).toBe(true);
        expect(firstDelta.inserted).toBe(true);

        const fromStart = await repositories.readTurnEventsAfter({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          after: -1,
        });
        const afterStart = await repositories.readTurnEventsAfter({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          after: 0,
        });

        expect(fromStart.map((event) => event.sequence)).toEqual([0, 1, 2]);
        expect(fromStart.map((event) => event.type)).toEqual(["started", "delta", "delta"]);
        expect(afterStart.map((event) => event.sequence)).toEqual([1, 2]);
        await expect(
          repositories.maxTurnEventSequence({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBe(2);

        // Idempotent re-append of an identical event is a no-op, not a duplicate.
        const replayDelta = await appendEvent(1, "delta", { content: "he" });
        expect(replayDelta.inserted).toBe(false);
        expect(replayDelta.record.sequence).toBe(1);
        await expect(
          repositories.maxTurnEventSequence({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBe(2);

        // A different payload at an existing sequence is durable-log corruption.
        await expect(appendEvent(1, "delta", { content: "DIFFERENT" })).rejects.toMatchObject({
          code: "event_log_conflict",
        });

        // Exactly one terminal event may exist, across any sequence.
        const completed = await appendEvent(3, "completed", { finishReason: "stop" });
        expect(completed.inserted).toBe(true);
        await expect(appendEvent(4, "error", { code: "internal" })).rejects.toMatchObject({
          code: "event_log_conflict",
        });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("denies turn-event access from another workspace", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        await repositories.appendTurnEvent({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          sequence: 0,
          type: "started" as never,
          payloadJson: {} as never,
          now,
        });

        await expect(
          repositories.readTurnEventsAfter({
            workspaceId: "other_workspace" as never,
            assistantTurnId: turn.assistantTurnId,
            after: -1,
          }),
        ).rejects.toMatchObject({ code: "record_not_found" });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("resolves turns by id, request id, and active conversation state", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // By id and by request id resolve to the same running turn.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, status: "running" });
        await expect(
          repositories.findAssistantTurnByRequest({
            workspaceId: workspaceId(scope),
            requestId: turn.requestId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId });

        // A running turn is the conversation's active turn.
        await expect(
          repositories.findActiveAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            conversationId: turn.conversationId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId });

        // Once terminal, the conversation no longer reports an active turn.
        await repositories.completeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          assistantMessageId: turn.userMessageId,
          finishReason: "stop",
          now,
        });
        await expect(
          repositories.findActiveAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            conversationId: turn.conversationId,
          }),
        ).resolves.toBeUndefined();

        // A cross-workspace or unknown id resolves to undefined, not a throw.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: "other_workspace" as never,
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBeUndefined();
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("records durable cancel intent for a running turn and no-ops once terminal", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // A running turn accepts the cancel intent and exposes it on the record.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: true });
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ status: "running", cancelRequestedAt: now });

        // Once the turn is terminal the running-guard makes a cancel a no-op.
        await repositories.failAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "user_aborted",
          errorCode: "aborted",
          now,
        });
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("does not cancel an unknown or cross-workspace turn", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // Unknown id: nothing matches the CAS, so it is a durable no-op.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: workspaceId(scope),
            assistantTurnId: "assistant_turn_missing" as never,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });

        // Cross-workspace id: the workspace clause excludes it, so a guessed id
        // from another tenant cannot cancel another workspace's turn.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: "other_workspace" as never,
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });
        const unchanged = await repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
        });
        expect(unchanged?.cancelRequestedAt).toBeUndefined();
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
