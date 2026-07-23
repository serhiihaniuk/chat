import { describe, expect, it } from "vitest";

import { DB_REPOSITORY_ERROR_CODES } from "#repositories/errors";
import { toAssistantMessageId } from "#schema-contract";
import {
  beginTurnCommand,
  readConversationHistory,
  startTurn,
  workspaceId,
} from "#testing/repository-contract.helpers";
import {
  AFTER_RECOVERY,
  CANCEL_REQUESTED_AT,
  createRecoveryRepositories,
  createWorkflowPool,
  RECOVERY_GRACE_EXPIRED,
  RECOVERY_GRACE_MS,
  SECOND_CANCEL_AT,
  seedWorkflowRun,
  setWorkflowRunStatus,
  STARTED_AT,
  WITHIN_RECOVERY_GRACE,
  ZERO_USAGE,
} from "#testing/turn/turn-recovery.integration.test-support";

const databaseUrl = requireDatabaseUrl();
let scopeIndex = 0;

describe("postgres Workflow turn recovery", () => {
  it.each(["pending", "running"] as const)(
    "treats a Workflow %s row as active",
    async (workflowStatus) => {
      const repositories = createRecoveryRepositories(databaseUrl);
      const pool = createWorkflowPool(databaseUrl);
      const scope = nextScope();
      const runId = `run_active_${workflowStatus}_${scope}`;
      try {
        const turn = await startTurn(repositories, scope);
        await seedWorkflowRun(pool, runId, workflowStatus);
        await repositories.bindTurnRun({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: STARTED_AT,
        });

        await expect(
          repositories.findActiveAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            conversationId: turn.conversationId,
          }),
        ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, runId });
        await expect(
          repositories.resolveConversationTurnAvailability({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            conversationId: turn.conversationId,
            recoveryGraceMs: RECOVERY_GRACE_MS,
            now: AFTER_RECOVERY,
          }),
        ).resolves.toBe(false);
      } finally {
        await pool.end();
        await repositories.close();
      }
    },
  );

  it.each(["completed", "failed", "cancelled"] as const)(
    "clears activity for Workflow %s and repairs the product turn once",
    async (workflowStatus) => {
      const repositories = createRecoveryRepositories(databaseUrl);
      const pool = createWorkflowPool(databaseUrl);
      const scope = nextScope();
      const runId = `run_terminal_${workflowStatus}_${scope}`;
      try {
        const turn = await startTurn(repositories, scope);
        await seedWorkflowRun(pool, runId, "pending");
        await repositories.bindTurnRun({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: STARTED_AT,
        });
        await setWorkflowRunStatus(pool, runId, workflowStatus);

        await expect(
          repositories.findActiveAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            conversationId: turn.conversationId,
          }),
        ).resolves.toBeUndefined();
        await expect(
          repositories.resolveConversationTurnAvailability({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            conversationId: turn.conversationId,
            recoveryGraceMs: RECOVERY_GRACE_MS,
            now: RECOVERY_GRACE_EXPIRED,
          }),
        ).resolves.toBe(true);
        await expect(
          repositories.resolveConversationTurnAvailability({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            conversationId: turn.conversationId,
            recoveryGraceMs: RECOVERY_GRACE_MS,
            now: AFTER_RECOVERY,
          }),
        ).resolves.toBe(true);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: turn.subjectId,
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({
          status: "failed",
          errorCode: "workflow_failed",
          completedAt: RECOVERY_GRACE_EXPIRED,
        });
      } finally {
        await pool.end();
        await repositories.close();
      }
    },
  );

  it("does not display a bound turn with a missing Workflow row as active", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const scope = nextScope();
    const runId = `run_missing_activity_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await repositories.bindTurnRun({
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: STARTED_AT,
      });

      await expect(
        repositories.findActiveAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
        }),
      ).resolves.toBeUndefined();
    } finally {
      await repositories.close();
    }
  });

  it("blocks admission during grace, then fences and replaces a missing run", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const pool = createWorkflowPool(databaseUrl);
    const scope = nextScope();
    const runId = `run_missing_admission_${scope}`;
    try {
      const original = await startTurn(repositories, scope);
      await repositories.bindTurnRun({
        workspaceId: workspaceId(scope),
        assistantTurnId: original.assistantTurnId,
        runId,
        now: STARTED_AT,
      });

      await expect(
        repositories.beginAssistantTurn({
          ...beginTurnCommand(scope, original.conversationId, `${scope}_within_grace`),
          recoveryGraceMs: RECOVERY_GRACE_MS,
          now: WITHIN_RECOVERY_GRACE,
        }),
      ).rejects.toMatchObject({ code: DB_REPOSITORY_ERROR_CODES.CONVERSATION_BUSY });

      const replacement = await repositories.beginAssistantTurn({
        ...beginTurnCommand(scope, original.conversationId, `${scope}_after_grace`),
        recoveryGraceMs: RECOVERY_GRACE_MS,
        now: RECOVERY_GRACE_EXPIRED,
      });
      expect(replacement.turn.status).toBe("open");
      await expect(
        repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: original.subjectId,
          assistantTurnId: original.assistantTurnId,
        }),
      ).resolves.toMatchObject({
        status: "failed",
        errorCode: "workflow_failed",
        completedAt: RECOVERY_GRACE_EXPIRED,
      });
      expect(
        await readConversationHistory(repositories, scope, original.conversationId),
      ).toHaveLength(2);

      await seedWorkflowRun(pool, runId, "pending");
      await expect(
        repositories.claimTurnRun({
          workspaceId: workspaceId(scope),
          subjectId: original.subjectId,
          conversationId: original.conversationId,
          assistantTurnId: original.assistantTurnId,
          runId,
          now: AFTER_RECOVERY,
        }),
      ).resolves.toMatchObject({ claimed: false, record: { status: "failed" } });
    } finally {
      await pool.end();
      await repositories.close();
    }
  });

  it("keeps a Workflow-side claim durable before the route binds the run", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const pool = createWorkflowPool(databaseUrl);
    const scope = nextScope();
    const runId = `run_workflow_claim_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await seedWorkflowRun(pool, runId, "pending");

      await expect(
        repositories.claimTurnRun({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: STARTED_AT,
        }),
      ).resolves.toMatchObject({ claimed: true, record: { runId } });
      await expect(
        repositories.findActiveAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
        }),
      ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, runId });
      await expect(
        repositories.bindTurnRun({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: AFTER_RECOVERY,
        }),
      ).resolves.toMatchObject({ assistantTurnId: turn.assistantTurnId, runId });
    } finally {
      await pool.end();
      await repositories.close();
    }
  });

  it("persists active-run cancellation before delivery and keeps retries idempotent", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const pool = createWorkflowPool(databaseUrl);
    const scope = nextScope();
    const runId = `run_cancel_active_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await seedWorkflowRun(pool, runId, "running");
      await repositories.claimTurnRun({
        workspaceId: workspaceId(scope),
        subjectId: turn.subjectId,
        conversationId: turn.conversationId,
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: STARTED_AT,
      });

      const cancel = (now: string) =>
        repositories.requestTurnCancellation({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          runId,
          now,
        });
      await expect(cancel(CANCEL_REQUESTED_AT)).resolves.toBe("deliver");
      await expect(cancel(SECOND_CANCEL_AT)).resolves.toBe("deliver");
      await expect(
        repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          assistantTurnId: turn.assistantTurnId,
        }),
      ).resolves.toMatchObject({
        status: "open",
        cancelRequestedAt: CANCEL_REQUESTED_AT,
      });
      await expect(
        repositories.claimTurnRun({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          assistantTurnId: turn.assistantTurnId,
          runId,
          now: AFTER_RECOVERY,
        }),
      ).resolves.toMatchObject({ claimed: false });
    } finally {
      await pool.end();
      await repositories.close();
    }
  });

  it("fences a missing-run cancellation and acknowledges repeated requests", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const scope = nextScope();
    const runId = `run_cancel_missing_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await repositories.bindTurnRun({
        workspaceId: workspaceId(scope),
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: STARTED_AT,
      });

      const cancel = (now: string) =>
        repositories.requestTurnCancellation({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          runId,
          now,
        });
      await expect(cancel(CANCEL_REQUESTED_AT)).resolves.toBe("acknowledged");
      await expect(cancel(SECOND_CANCEL_AT)).resolves.toBe("acknowledged");
      await expect(
        repositories.findAssistantTurn({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          assistantTurnId: turn.assistantTurnId,
        }),
      ).resolves.toMatchObject({
        status: "cancelled",
        cancelRequestedAt: CANCEL_REQUESTED_AT,
        completedAt: CANCEL_REQUESTED_AT,
      });
    } finally {
      await repositories.close();
    }
  });

  it("commits one terminal outcome when normal finalization races repair", async () => {
    const repositories = createRecoveryRepositories(databaseUrl);
    const pool = createWorkflowPool(databaseUrl);
    const scope = nextScope();
    const runId = `run_finalize_repair_race_${scope}`;
    try {
      const turn = await startTurn(repositories, scope);
      await seedWorkflowRun(pool, runId, "pending");
      await repositories.claimTurnRun({
        workspaceId: workspaceId(scope),
        subjectId: turn.subjectId,
        conversationId: turn.conversationId,
        assistantTurnId: turn.assistantTurnId,
        runId,
        now: STARTED_AT,
      });
      await setWorkflowRunStatus(pool, runId, "completed");

      const [finalized, available] = await Promise.all([
        repositories.finalizeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "completed",
          assistantMessage: {
            messageId: toAssistantMessageId(`${turn.conversationId}:assistant`),
            parts: [{ type: "text", text: "Durable answer" }],
            metadataJson: {},
          },
          finishReason: "stop",
          usage: ZERO_USAGE,
          now: CANCEL_REQUESTED_AT,
        }),
        repositories.resolveConversationTurnAvailability({
          workspaceId: workspaceId(scope),
          subjectId: turn.subjectId,
          conversationId: turn.conversationId,
          recoveryGraceMs: RECOVERY_GRACE_MS,
          now: SECOND_CANCEL_AT,
        }),
      ]);

      const stored = await repositories.findAssistantTurn({
        workspaceId: workspaceId(scope),
        subjectId: turn.subjectId,
        assistantTurnId: turn.assistantTurnId,
      });
      const assistantMessages = (
        await readConversationHistory(repositories, scope, turn.conversationId)
      ).filter((message) => message.role === "assistant");
      expect(available).toBe(true);
      expect(["completed", "failed"]).toContain(stored?.status);
      expect(finalized.claimed).toBe(stored?.status === "completed");
      expect(assistantMessages.length).toBeLessThanOrEqual(1);
      expect(assistantMessages).toHaveLength(stored?.status === "completed" ? 1 : 0);
    } finally {
      await pool.end();
      await repositories.close();
    }
  });
});

const nextScope = (): string => {
  scopeIndex += 1;
  return `turn_recovery_${scopeIndex}`;
};

function requireDatabaseUrl(): string {
  const value = process.env["SIDECHAT_TEST_DATABASE_URL"];
  if (!value) {
    throw new Error("SIDECHAT_TEST_DATABASE_URL is required for database integration tests.");
  }
  return value;
}
