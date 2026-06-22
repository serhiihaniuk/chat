import type { AssistantTurnLifecyclePort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";
import type { SidechatRepositories } from "@side-chat/db";

/**
 * Bridge the owner-lease lifecycle-port methods to the durable repository CAS.
 *
 * Core's generation fiber claims and heartbeats the lease through these two
 * methods; both just forward to the workspace-scoped repository compare-and-set
 * and keep the thrown `DbRepositoryError` in the port's `unknown` failure channel
 * (core maps it to a typed core error). They live beside the rest of the
 * assistant-turn persistence but in their own file so the main adapter stays
 * within the per-file function-count budget.
 */
export const createAcquireTurnLeaseEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["acquireTurnLease"] =>
  ({ authContext, assistantTurnId, ownerInstanceId, leaseTtlMs, now }) =>
    Effect.tryPromise({
      try: () =>
        repositories.acquireTurnLease({
          workspaceId: authContext.workspaceId,
          assistantTurnId,
          ownerInstanceId,
          leaseTtlMs,
          now,
        }),
      catch: (error) => error,
    });

export const createRenewTurnLeaseEffect =
  (repositories: SidechatRepositories): AssistantTurnLifecyclePort["renewTurnLease"] =>
  ({ authContext, assistantTurnId, ownerInstanceId, leaseEpoch, leaseTtlMs, now }) =>
    Effect.tryPromise({
      try: () =>
        repositories.renewTurnLease({
          workspaceId: authContext.workspaceId,
          assistantTurnId,
          ownerInstanceId,
          leaseEpoch,
          leaseTtlMs,
          now,
        }),
      catch: (error) => error,
    });
