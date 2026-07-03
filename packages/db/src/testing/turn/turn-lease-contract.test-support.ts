import { describe, expect, it } from "vitest";

import type { SidechatRepositories } from "#repositories/contract";
import {
  closeIfNeeded,
  startTurn,
  subjectId,
  workspaceId,
} from "../repository-contract.helpers.js";

const LEASE_TTL_MS = 30_000;
const NULL_LEASE_GRACE_MS = 2 * LEASE_TTL_MS;
const OWNER_A = "instance_a";
const OWNER_B = "instance_b";

// A fixed acquire clock plus a far-future reap clock makes "the lease expired"
// deterministic: every acquired lease is in the past relative to the reap now.
const ACQUIRE_NOW = "2026-06-21T00:00:00.000Z";
const FUTURE_NOW = "2026-06-21T01:00:00.000Z";

// The sweep is deliberately workspace-global, and the postgres suite shares one
// database across the contract suites, so a sweep can also claim stale running
// turns earlier suites left behind. A generous limit keeps this suite's target
// turn inside every pass.
const REAP_LIMIT = 100;

const reapAt = (repositories: SidechatRepositories, now: string) =>
  repositories.reapExpiredTurns({ now, nullLeaseGraceMs: NULL_LEASE_GRACE_MS, limit: REAP_LIMIT });

/**
 * Shared owner-lease + reaper contract for both repository adapters.
 *
 * It proves the compare-and-set fencing the resumable-streaming plan requires:
 * acquire claims ownership and bumps the epoch, a heartbeat renews only at the
 * held epoch, a fenced owner sees no renew, and the reaper terminalizes an
 * expired-lease turn exactly once with the honest status — even under concurrent
 * passes.
 */
export const turnLeaseRepositoryContract = (
  label: string,
  createRepositories: () => SidechatRepositories,
) => {
  let scopeCounter = 0;
  const nextScope = () => `${label.replace(/\W+/gu, "_")}_lease_${++scopeCounter}`;

  describe("owner lease and reaper contract", () => {
    it("acquires a lease, renews at the held epoch, and fences a stale owner", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);
        const acquire = await repositories.acquireTurnLease({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          ownerInstanceId: OWNER_A,
          leaseTtlMs: LEASE_TTL_MS,
          now: ACQUIRE_NOW,
        });

        // Acquire took ownership and bumped the epoch from its default of 0.
        expect(acquire.acquired).toBe(true);
        expect(acquire.leaseEpoch).toBe(1);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ ownerInstanceId: OWNER_A, leaseEpoch: 1 });

        // A heartbeat at the held epoch renews.
        await expect(
          repositories.renewTurnLease({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            ownerInstanceId: OWNER_A,
            leaseEpoch: acquire.leaseEpoch,
            leaseTtlMs: LEASE_TTL_MS,
            now: ACQUIRE_NOW,
          }),
        ).resolves.toEqual({ renewed: true });

        // A new owner steals the lease, bumping the epoch underneath OWNER_A.
        const stolen = await repositories.acquireTurnLease({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          ownerInstanceId: OWNER_B,
          leaseTtlMs: LEASE_TTL_MS,
          now: ACQUIRE_NOW,
        });
        expect(stolen.leaseEpoch).toBe(2);

        // OWNER_A's heartbeat at the now-stale epoch is fenced.
        await expect(
          repositories.renewTurnLease({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            ownerInstanceId: OWNER_A,
            leaseEpoch: acquire.leaseEpoch,
            leaseTtlMs: LEASE_TTL_MS,
            now: ACQUIRE_NOW,
          }),
        ).resolves.toEqual({ renewed: false });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("does not acquire a lease on an unknown, cross-workspace, or terminal turn", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await startTurn(repositories, scope);

        await expect(
          repositories.acquireTurnLease({
            workspaceId: workspaceId(scope),
            assistantTurnId: "assistant_turn_missing" as never,
            ownerInstanceId: OWNER_A,
            leaseTtlMs: LEASE_TTL_MS,
            now: ACQUIRE_NOW,
          }),
        ).resolves.toEqual({ acquired: false, leaseEpoch: 0 });

        await expect(
          repositories.acquireTurnLease({
            workspaceId: "other_workspace" as never,
            assistantTurnId: turn.assistantTurnId,
            ownerInstanceId: OWNER_A,
            leaseTtlMs: LEASE_TTL_MS,
            now: ACQUIRE_NOW,
          }),
        ).resolves.toEqual({ acquired: false, leaseEpoch: 0 });

        // A terminal turn is no longer running, so its lease cannot be claimed.
        await repositories.completeAssistantTurn({
          workspaceId: workspaceId(scope),
          assistantTurnId: turn.assistantTurnId,
          assistantMessageId: turn.userMessageId,
          finishReason: "stop",
          now: ACQUIRE_NOW,
        });
        await expect(
          repositories.acquireTurnLease({
            workspaceId: workspaceId(scope),
            assistantTurnId: turn.assistantTurnId,
            ownerInstanceId: OWNER_A,
            leaseTtlMs: LEASE_TTL_MS,
            now: ACQUIRE_NOW,
          }),
        ).resolves.toEqual({ acquired: false, leaseEpoch: 0 });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("reaps an expired-lease turn once, bumps the epoch, and leaves live leases alone", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await acquiredTurn(repositories, scope, OWNER_A);

        // A now inside the lease window (the acquire instant) reaps nothing: the
        // lease has not expired yet.
        const withinWindow = await reapAt(repositories, ACQUIRE_NOW);
        expect(withinWindow.map((row) => row.assistantTurnId)).not.toContain(turn.assistantTurnId);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ status: "running" });

        // A now past the lease expiry reaps it, fencing the owner: the status is
        // terminal and the epoch advanced past the acquire epoch (1 -> 2).
        const reaped = await reapAt(repositories, FUTURE_NOW);
        const reapedRow = reaped.find((row) => row.assistantTurnId === turn.assistantTurnId);
        expect(reapedRow?.leaseEpoch).toBe(2);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({
          status: "provider_failed",
          errorCode: "timeout",
          leaseEpoch: 2,
        });

        // A second pass at the same now finds the turn no longer running, so it is
        // not reaped again — exactly-once across passes.
        const secondPass = await reapAt(repositories, FUTURE_NOW);
        expect(secondPass.map((row) => row.assistantTurnId)).not.toContain(turn.assistantTurnId);
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("reaps a running turn that never acquired a lease once its grace elapsed", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        // A crash between the turn insert and the lease acquire leaves a running
        // row with no lease at all; only the started-at grace can catch it.
        const turn = await startTurn(repositories, scope);
        const startedAtMs = new Date(turn.startedAt).getTime();
        const withinGrace = new Date(startedAtMs + NULL_LEASE_GRACE_MS / 2).toISOString();
        const pastGrace = new Date(startedAtMs + NULL_LEASE_GRACE_MS + 1_000).toISOString();

        // Within the grace window the turn may still be racing toward its lease
        // acquire, so it survives the sweep.
        const early = await reapAt(repositories, withinGrace);
        expect(early.map((row) => row.assistantTurnId)).not.toContain(turn.assistantTurnId);

        const reaped = await reapAt(repositories, pastGrace);
        expect(reaped.map((row) => row.assistantTurnId)).toContain(turn.assistantTurnId);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ status: "provider_failed", errorCode: "timeout" });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("records a reaped turn with cancel intent as user_aborted", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await acquiredTurn(repositories, scope, OWNER_A);
        await repositories.requestTurnCancellation({
          workspaceId: workspaceId(scope),
          subjectId: subjectId(scope),
          assistantTurnId: turn.assistantTurnId,
          now: ACQUIRE_NOW,
        });

        const reaped = await reapAt(repositories, FUTURE_NOW);
        const reapedRow = reaped.find((row) => row.assistantTurnId === turn.assistantTurnId);
        expect(reapedRow?.cancelRequested).toBe(true);
        await expect(
          repositories.findAssistantTurn({
            workspaceId: workspaceId(scope),
            subjectId: subjectId(scope),
            assistantTurnId: turn.assistantTurnId,
          }),
        ).resolves.toMatchObject({ status: "user_aborted", errorCode: "aborted" });
      } finally {
        await closeIfNeeded(repositories);
      }
    });

    it("does not double-terminalize under concurrent reaper passes", async () => {
      const repositories = createRepositories();
      const scope = nextScope();
      try {
        const turn = await acquiredTurn(repositories, scope, OWNER_A);

        // Two passes race over the same expired turn; the running-guard CAS lets
        // exactly one win, so the turn appears in exactly one pass's result.
        const [first, second] = await Promise.all([
          reapAt(repositories, FUTURE_NOW),
          reapAt(repositories, FUTURE_NOW),
        ]);
        const reapCount = [first, second]
          .flat()
          .filter((row) => row.assistantTurnId === turn.assistantTurnId).length;
        expect(reapCount).toBe(1);
      } finally {
        await closeIfNeeded(repositories);
      }
    });
  });
};

/** Start a turn and claim its lease, so it is a running turn owned at epoch 1. */
const acquiredTurn = async (
  repositories: SidechatRepositories,
  scope: string,
  ownerInstanceId: string,
) => {
  const turn = await startTurn(repositories, scope);
  await repositories.acquireTurnLease({
    workspaceId: workspaceId(scope),
    assistantTurnId: turn.assistantTurnId,
    ownerInstanceId,
    leaseTtlMs: LEASE_TTL_MS,
    now: ACQUIRE_NOW,
  });
  return turn;
};
