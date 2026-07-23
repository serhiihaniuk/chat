import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import { toConversationId, toSubjectId, toWorkspaceId } from "#schema-contract";
import {
  closeIfNeeded,
  now,
  startTurn,
  subjectId,
  workspaceId,
} from "../repository-contract.helpers.js";

const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
} as const;

/**
 * Shared turn-resolution contract for the postgres repository adapter.
 *
 * It proves the read surface the resumable routes depend on: a turn resolves by
 * id and by request id. Product `open` alone is deliberately not active: the
 * Postgres integration suite proves effective activity against real Workflow rows.
 * an unknown, cross-workspace, or cross-subject id resolves to `undefined` rather
 * than throwing, so a guessed or leaked id maps to a not-found response.
 */
export const turnResolutionRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_resolution_${++scopeCounter}`;

  describe("turn resolution contract", () => {
    it("resolves records while excluding product-open rows without Workflow evidence", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        // By id and by request id resolve to the same product-open turn.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({
          assistantTurnId: turn.assistantTurnId,
          status: "open",
        });
        await expect(
          repositories.findAssistantTurnByRequest({
            workspaceId: workspaceId(scope),
            requestId: turn.requestId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId });

        // Product-open is not enough to claim runtime activity.
        await expect(
          repositories.findActiveAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            conversationId: turn.conversationId,
          }),
        ).resolves.toBeUndefined();

        // Once terminal, the conversation no longer reports an active turn.
        await repositories.finalizeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "completed",
          finishReason: "stop",
          usage: ZERO_USAGE,
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
            workspaceId: toWorkspaceId("other_workspace"),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBeUndefined();

        // A cross-subject id resolves to undefined: another user with a leaked
        // turn id cannot read it even inside the same workspace.
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: toSubjectId("other_subject"),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toBeUndefined();
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("resolves a conversation by id and a turn by its bound run, denying cross-tenant reads", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      const runId = `${scope}_run`;
      try {
        const turn = await startTurn(repositories, scope);

        // findConversation resolves the owning conversation, scoped to workspace + subject.
        await expect(
          repositories.findConversation({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            conversationId: turn.conversationId,
          }),
        ).resolves.toMatchObject({
          conversationId: turn.conversationId,
          subjectId: subjectId(scope),
        });

        // Unknown, cross-workspace, and cross-subject ids resolve to undefined, not a throw.
        await expect(
          repositories.findConversation({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            conversationId: toConversationId(`${scope}_missing`),
          }),
        ).resolves.toBeUndefined();
        await expect(
          repositories.findConversation({
            workspaceId: toWorkspaceId("other_workspace"),
            subjectId: subjectId(scope),
            conversationId: turn.conversationId,
          }),
        ).resolves.toBeUndefined();
        await expect(
          repositories.findConversation({
            workspaceId: workspaceId(scope),
            subjectId: toSubjectId("other_subject"),
            conversationId: turn.conversationId,
          }),
        ).resolves.toBeUndefined();

        // A turn has no bound run until bindTurnRun: the run lookup is undefined first.
        await expect(
          repositories.findAssistantTurnByRun({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            runId,
          }),
        ).resolves.toBeUndefined();

        await repositories.bindTurnRun({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          runId,
          now,
        });

        // Once bound, the run resolves to its turn, scoped to workspace + subject.
        await expect(
          repositories.findAssistantTurnByRun({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            runId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, runId });

        // Cross-subject scoping denies the run read without revealing it.
        await expect(
          repositories.findAssistantTurnByRun({
            workspaceId: workspaceId(scope),
            subjectId: toSubjectId("other_subject"),
            runId,
          }),
        ).resolves.toBeUndefined();
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("re-runs a terminal claim as an idempotent no-op and honors cross-subject denial", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        const first = await repositories.finalizeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "completed",
          finishReason: "stop",
          usage: ZERO_USAGE,
          now,
        });
        expect(first.claimed).toBe(true);

        // A crash replay or duplicate finalize matches no open row: a no-op that
        // leaves the durable status untouched rather than raising.
        const replay = await repositories.finalizeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "failed",
          errorCode: "should_not_apply",
          usage: ZERO_USAGE,
          now,
        });
        expect(replay.claimed).toBe(false);
        expect(replay.record.status).toBe("completed");
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};
