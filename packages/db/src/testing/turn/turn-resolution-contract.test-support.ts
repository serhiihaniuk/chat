import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import {
  closeIfNeeded,
  now,
  startTurn,
  subjectId,
  workspaceId,
} from "../repository-contract.helpers.js";

/**
 * Shared turn-resolution + cancel-intent contract for both repository adapters.
 *
 * It proves the read and cancel surface the resumable routes depend on: a turn
 * resolves by id, by request id, and as a conversation's active turn until it goes
 * terminal; an unknown, cross-workspace, or cross-subject id resolves to
 * `undefined` rather than throwing; and a durable cancel intent is recorded for a
 * running turn but is a no-op once the turn is terminal, unknown, or owned by
 * another workspace or subject.
 */
export const turnResolutionRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_resolution_${++scopeCounter}`;

  describe("turn resolution and cancel-intent contract", () => {
    it("resolves turns by id, request id, and active conversation state", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // By id and by request id resolve to the same running turn.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({
          assistantTurnId: turn.assistantTurnId,
          status: "running",
        });
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
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBeUndefined();

        // A cross-subject id resolves to undefined: another user with a leaked
        // turn id cannot read it even inside the same workspace.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: "other_subject" as never,
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
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: true });
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
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
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("does not cancel an unknown, cross-workspace, or cross-subject turn", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // Unknown id: nothing matches the CAS, so it is a durable no-op.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: "assistant_turn_missing" as never,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });

        // Cross-workspace id: the workspace clause excludes it, so a guessed id
        // from another tenant cannot cancel another workspace's turn.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: "other_workspace" as never,
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });

        // Cross-subject id: another user in the same workspace with a leaked turn
        // id cannot cancel it.
        await expect(
          repositories.requestTurnCancellation({
            workspaceId: workspaceId(scope),
            subjectId: "other_subject" as never,
            assistantTurnId: turn.assistantTurnId,
            now,
          }),
        ).resolves.toEqual({ cancelRequested: false });
        const unchanged = await repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          assistantTurnId: turn.assistantTurnId,
        });
        expect(unchanged?.cancelRequestedAt).toBeUndefined();
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
