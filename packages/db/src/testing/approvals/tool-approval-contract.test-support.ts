import { describe, expect, it } from "vitest";

import { toActorId, toToolApprovalId } from "#schema-contract";
import type { SidechatRepositories } from "#repositories/contract";
import { DB_REPOSITORY_ERROR_CODES } from "#repositories/errors";
import {
  actorId,
  closeIfNeeded,
  now,
  startTurn,
  subjectId,
  workspaceId,
} from "../repository-contract.helpers.js";

type RepositoryFactory = () => SidechatRepositories;

/** Adapter-neutral contract for replay-safe authorization and terminal decisions. */
export const toolApprovalRepositoryContract = (
  label: string,
  createRepositories: RepositoryFactory,
): void => {
  let scopeIndex = 0;
  const nextScope = () => `${label.replaceAll(/\W+/gu, "_")}_approval_${++scopeIndex}`;

  describe("tool approval repository", () => {
    it("creates one request and rejects replayed identity drift", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const command = approvalRequest(scope, turn.assistantTurnId);

        const created = await repositories.createOrGetToolApproval(command);
        const replayed = await repositories.createOrGetToolApproval(command);

        expect(created.record.state).toBe("requested");
        expect(replayed).toEqual({ record: created.record, inserted: false });
        await expect(
          repositories.createOrGetToolApproval({ ...command, inputDigest: "sha256:tampered" }),
        ).rejects.toMatchObject({ code: DB_REPOSITORY_ERROR_CODES.INVALID_TRANSITION });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("accepts one decision, idempotently reuses it, and rejects a conflict", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const request = approvalRequest(scope, turn.assistantTurnId);
        await repositories.createOrGetToolApproval(request);
        const decision = approvalDecision(scope, turn.assistantTurnId, request, "approved");

        const accepted = await repositories.decideToolApproval(decision);
        const duplicate = await repositories.decideToolApproval(decision);
        const conflict = await repositories.decideToolApproval({ ...decision, decision: "denied" });

        expect(accepted).toMatchObject({ disposition: "accepted", record: { state: "approved" } });
        expect(duplicate).toMatchObject({
          disposition: "duplicate",
          record: { state: "approved" },
        });
        expect(conflict).toMatchObject({
          disposition: "rejected",
          rejection: "conflicting_decision",
          record: { state: "approved" },
        });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("expires only after the durable deadline and rejects a later decision", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const request = approvalRequest(scope, turn.assistantTurnId);
        await repositories.createOrGetToolApproval(request);
        const identity = {
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          approvalId: request.approvalId,
          auditActorId: toActorId(`${scope}_system`),
        } as const;

        const early = await repositories.expireToolApproval({
          ...identity,
          now: "2026-05-23T13:59:59.000Z",
        });
        const expired = await repositories.expireToolApproval({
          ...identity,
          now: request.expiresAt,
        });
        const late = await repositories.decideToolApproval(
          approvalDecision(scope, turn.assistantTurnId, request, "approved", request.expiresAt),
        );

        expect(early).toMatchObject({ claimed: false, record: { state: "requested" } });
        expect(expired).toMatchObject({ claimed: true, record: { state: "expired" } });
        expect(late).toMatchObject({
          disposition: "rejected",
          rejection: "expired",
          record: { state: "expired" },
        });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("rejects a decision after its turn becomes terminal", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const request = approvalRequest(scope, turn.assistantTurnId);
        await repositories.createOrGetToolApproval(request);
        await repositories.finalizeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          status: "cancelled",
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            reasoningTokens: 0,
            cachedInputTokens: 0,
          },
          now: "2026-05-23T13:15:00.000Z",
        });

        const decision = await repositories.decideToolApproval(
          approvalDecision(scope, turn.assistantTurnId, request, "approved"),
        );

        expect(decision).toMatchObject({
          disposition: "rejected",
          rejection: "turn_not_running",
          record: { state: "requested" },
        });
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};

const approvalRequest = (scope: string, assistantTurnId: string) =>
  ({
    workspaceId: workspaceId(scope),
    assistantTurnId,
    approvalId: toToolApprovalId(`${scope}_approval_1`),
    toolCallId: `${scope}_call_1`,
    toolName: "execute_sql",
    inputDigest: "sha256:input-1",
    expiresAt: "2026-05-23T14:00:00.000Z",
    now,
  }) as const;

const approvalDecision = (
  scope: string,
  assistantTurnId: string,
  request: ReturnType<typeof approvalRequest>,
  decision: "approved" | "denied",
  decidedAt = "2026-05-23T13:30:00.000Z",
) =>
  ({
    workspaceId: workspaceId(scope),
    assistantTurnId,
    approvalId: request.approvalId,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    inputDigest: request.inputDigest,
    decision,
    approverSubjectId: subjectId(scope),
    approverActorId: actorId(scope),
    now: decidedAt,
  }) as const;
