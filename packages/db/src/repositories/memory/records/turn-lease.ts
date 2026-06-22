import {
  toAssistantTurnId,
  toWorkspaceId,
  type AcquireTurnLeaseCommand,
  type AcquireTurnLeaseResult,
  type AssistantTurnRecord,
  type AssistantTurnRepositoryContract,
  type ReapExpiredTurnsCommand,
  type ReapedTurn,
  type RenewTurnLeaseCommand,
  type RenewTurnLeaseResult,
} from "#schema-contract";
import type { MemoryRepositoryContext } from "./conversations.js";
import { upsertAt, type MemoryStore } from "../store/store.js";

/**
 * Mirror the postgres owner-lease fencing for the memory adapter.
 *
 * The CAS clauses match the durable adapter exactly (running-guard, owner+epoch
 * fence, expiry comparison) so the shared lease contract holds across both. A
 * single-instance memory deployment never fences itself, but the reaper path is
 * still exercised here against in-memory turns.
 */
export const createMemoryTurnLeaseRepository = ({
  store,
}: MemoryRepositoryContext): Pick<
  AssistantTurnRepositoryContract,
  "acquireTurnLease" | "renewTurnLease" | "reapExpiredTurns"
> => ({
  acquireTurnLease: (command) => acquireTurnLease(store, command),
  renewTurnLease: (command) => renewTurnLease(store, command),
  reapExpiredTurns: (command) => reapExpiredTurns(store, command),
});

const acquireTurnLease = async (
  store: MemoryStore,
  command: AcquireTurnLeaseCommand,
): Promise<AcquireTurnLeaseResult> => {
  await Promise.resolve();
  const index = findRunningTurnIndex(store, command.workspaceId, command.assistantTurnId);
  if (index < 0) return { acquired: false, leaseEpoch: 0 };

  const current = store.assistantTurns[index]!;
  const leaseEpoch = current.leaseEpoch + 1;
  upsertAt(store.assistantTurns, index, {
    ...current,
    ownerInstanceId: command.ownerInstanceId,
    leaseEpoch,
    leaseExpiresAt: leaseExpiry(command.now, command.leaseTtlMs),
    updatedAt: command.now,
  });
  return { acquired: true, leaseEpoch };
};

const renewTurnLease = async (
  store: MemoryStore,
  command: RenewTurnLeaseCommand,
): Promise<RenewTurnLeaseResult> => {
  await Promise.resolve();
  const index = findRunningTurnIndex(store, command.workspaceId, command.assistantTurnId);
  if (index < 0) return { renewed: false };

  const current = store.assistantTurns[index]!;
  // Owner+epoch is the fence: a bumped epoch (reaper or new owner) means this
  // owner is stale and must stop, so the renew reports not-renewed.
  if (
    current.ownerInstanceId !== command.ownerInstanceId ||
    current.leaseEpoch !== command.leaseEpoch
  ) {
    return { renewed: false };
  }

  upsertAt(store.assistantTurns, index, {
    ...current,
    leaseExpiresAt: leaseExpiry(command.now, command.leaseTtlMs),
    updatedAt: command.now,
  });
  return { renewed: true };
};

const reapExpiredTurns = async (
  store: MemoryStore,
  command: ReapExpiredTurnsCommand,
): Promise<readonly ReapedTurn[]> => {
  await Promise.resolve();
  const expired = store.assistantTurns
    .map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => isExpiredRunning(turn, command.now))
    .slice(0, command.limit);

  return expired.map(({ turn, index }) => reapTurn(store, index, turn, command.now));
};

const reapTurn = (
  store: MemoryStore,
  index: number,
  turn: AssistantTurnRecord,
  now: string,
): ReapedTurn => {
  const cancelRequested = turn.cancelRequestedAt !== undefined;
  const leaseEpoch = turn.leaseEpoch + 1;
  upsertAt(store.assistantTurns, index, {
    ...turn,
    status: cancelRequested ? "user_aborted" : "provider_failed",
    errorCode: cancelRequested ? "aborted" : "timeout",
    leaseEpoch,
    completedAt: now,
    updatedAt: now,
  });
  return {
    workspaceId: toWorkspaceId(turn.workspaceId),
    assistantTurnId: toAssistantTurnId(turn.assistantTurnId),
    cancelRequested,
    leaseEpoch,
  };
};

const findRunningTurnIndex = (
  store: MemoryStore,
  workspaceId: string,
  assistantTurnId: string,
): number =>
  store.assistantTurns.findIndex(
    (turn) =>
      turn.workspaceId === workspaceId &&
      turn.assistantTurnId === assistantTurnId &&
      turn.status === "running",
  );

const isExpiredRunning = (turn: AssistantTurnRecord, now: string): boolean =>
  turn.status === "running" &&
  turn.leaseExpiresAt !== undefined &&
  new Date(turn.leaseExpiresAt).getTime() < new Date(now).getTime();

/** Resolve the absolute lease expiry from the injected clock, mirroring postgres. */
const leaseExpiry = (now: string, leaseTtlMs: number): string =>
  new Date(new Date(now).getTime() + leaseTtlMs).toISOString();
