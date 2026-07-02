# 05 — Orphan-turn reaper sweep

**Epic:** 1 Streaming | **Priority:** P0 | **Depends on:** — | **Status:** done (2026-07-02)

## Delivery notes

- **The sweep is back, smaller than the deleted one:** `inbound/turn-runner/maintenance/turn-reaper.ts` — periodic fiber per instance (`reaperInterval`/`reaperBatchLimit` reconnected from config via `resolveResumabilityConfig`), wired in `service-composition.ts`, torn down in `shutdown()`, exposed as `composition.turnReaper` (`sweepOnce` for tests). The old reaper's synthetic-terminal append is gone with the durable `turn_events` log — the crashed owner's stream buffer died with it, so the reaper only CASes the status; clients converge from history.
- **NULL-lease window closed:** `ReapExpiredTurnsCommand` gained `nullLeaseGraceMs`; both adapters' predicates are now `running AND (lease_expires_at < now OR (lease IS NULL AND started_at < now - grace))`. Composition passes grace = 2× lease TTL. Contract test added ("never acquired a lease": within grace survives, past grace reaped).
- **Reap notifies activity in-transaction:** the Postgres reap runs in a transaction and emits the `turn_activity` NOTIFY per reaped row (payload builder `activityNotifyPayload` moved to `records.ts`, shared with turns.ts), so other tabs' "generating" dots clear live. Memory adapter stays notify-less like its other paths.
- **Heartbeat resilience:** `renewTurnLease` failures are retried (2 retries, 200ms exponential backoff) before they can fail the heartbeat race; a _successful_ renew reporting `renewed: false` still fences immediately. New `turn-lease-heartbeat.test.ts` proves both (flaky renew → drain completes; fence → drain interrupted), built on `createFakePorts` + `prepareStreamChatTurn` — no unsafe casts.
- **Tests/observability:** new `turn-reaper.test.ts` (sweepOnce terminalizes a crashed NULL-lease turn honestly + clears the ghost active turn + records `turn_reaped`; periodic fiber sweeps until shutdown); lease-contract calls routed through a `reapAt` helper with limit 100 (the sweep is workspace-global and the postgres suite shares one DB). Full `npm run verify` green. `npm run test:db:container` NOT run — Docker unavailable on this machine; the postgres side of the new contract test needs one container run before release.
- **Docs:** assistant-turn.md crash-recovery section rewritten to the shipped sweep; ADR 0008 consequences updated (landed); ADR 0007 pending list shrunk; configuration.md resumability row (reaper knobs live; pruner/retention still dead until `plan/10`). The stale comments named in task 4 (`turn-cancel-notification-source.ts`, `lifecycle.ts`) are true again verbatim — verified, no edits needed; `repositories.ts` ReapedTurn doc reworded (no synthetic terminal).

## Problem

The reaper loop was deleted (`be8303f`) but nothing replaced its job. After a hard crash (OOM, kill -9; clean shutdown is handled correctly via `onExit`):

- The turn row stays `status='running'` **forever**: permanent "generating" dot (activity snapshot re-reads it on every connect — `apps/partner-ai-service/src/inbound/turn-stream/activity/activity-subscription-stream.ts:45`), `findActiveAssistantTurn` reports a ghost active turn indefinitely (`packages/db/src/repositories/postgres-drizzle/records/turn-lookups.ts:55-72`).
- A `requestId` retry resolves to the zombie and never re-forks (`turn-runner.ts:93`) — the "any instance serves the next turn" model is poisoned.
- `reapExpiredTurns` is fully implemented and race-tested in both adapters (`packages/db/src/repositories/postgres-drizzle/records/turn-lease.ts:111-150`: CAS, `FOR UPDATE SKIP LOCKED`, honest `user_aborted`/`provider_failed` classification; concurrent-reap exactly-once test at `packages/db/src/testing/turn/turn-lease-contract.test-support.ts:208-227`) — **zero production callers**.
- The reap predicate cannot catch the insert-to-lease window: SQL `lease_expires_at < now` is never true for NULL (`turn-lease.ts:149`); the memory adapter requires the field set (`packages/db/src/repositories/memory/records/turn-lease.ts:131-133`). The service commits `running` before generation forks and acquires the lease, so a crash in that window leaves a NULL-lease running row no reaper variant can reap.
- The lease heartbeat still runs (1 UPDATE/10 s/turn) protecting against a fencer that no longer exists, and a single transient DB error in `renewTurnLease` fails `heartbeatUntilFenced` (`packages/partner-ai-core/src/application/stream-chat/protocol/lease/turn-lease-heartbeat.ts:76-87`, no retry) — `Effect.raceFirst` then interrupts a **healthy** generation.

## Decided approach

Recorded as **ADR 0008** (`docs/adr/0008-crash-recovery-lease-sweep.md`) — the full crash-recovery design this story implements the server half of; update it if implementation deviates.

Reinstate a small periodic sweep (the machinery already exists; the deleted loop is in git history at `be8303f` — `turn-reaper.ts`, 219 lines with 283 lines of tests, one `git show` away):

1. A maintenance fiber in service composition calls `reapExpiredTurns` every `reaperIntervalMs` with `reaperBatchLimit` (the config knobs still exist — `apps/partner-ai-service/src/config/catalog/config-values.ts:102-103` — reconnect them instead of deleting them; delete only the pruner/retention knobs in story 10).
2. All instances may run it concurrently (`SKIP LOCKED` makes claims disjoint) — no leader election needed.
3. Widen the predicate in BOTH adapters: expired ≡ `status='running' AND (lease_expires_at < now OR (lease_expires_at IS NULL AND started_at < now - grace))` with grace ≈ 2× lease TTL. Update the shared contract test to cover the NULL-lease case.
4. Reaped turns get the existing classification (cancel-intent → `user_aborted`, else `provider_failed`) — already implemented.
5. **Verify the reap emits the `turn_activity` NOTIFY** in the same transaction as the status CAS (the complete/fail/cancel paths do — `records/turns.ts`; check whether `reapExpiredTurns` does). Without it, other tabs' "generating" dots only clear on their next activity snapshot, not live.
6. Heartbeat resilience: retry `renewTurnLease` (2–3 attempts, short backoff) before treating the lease as fenced, so one DB blip cannot kill a healthy turn.

## Tasks

1. `git show be8303f -- apps/partner-ai-service/src/inbound/turn-runner/maintenance/turn-reaper.ts` (and its test) as the starting point; re-add under the current composition shape (`service-composition.ts` — wire like the cancel/activity dispatchers, scoped, shut down in `shutdown()`).
2. Widen both adapters' reap predicates + the contract test (`turn-lease-contract.test-support.ts`): add "running with NULL lease past grace is reaped; within grace is not".
3. Add heartbeat renew retry in `turn-lease-heartbeat.ts`; keep the fence semantics (a _successful_ renew that reports fenced still interrupts immediately).
4. Update stale comments that currently promise a reaper that doesn't exist (`turn-cancel-notification-source.ts:22-23`, `packages/db/src/schema-contract/lifecycle.ts:56-58`, `schema-contract/repositories.ts:147-166`) — they become true again; verify wording matches the new sweep.
5. Memory-adapter parity: the sweep must run against in-memory persistence too (dev profile), same interval.

## Acceptance criteria

- [ ] Kill a locally running turn's process mid-generation (or simulate: insert a running turn with expired/NULL lease); within `reaperIntervalMs + grace` the turn is terminal, the activity dot clears, and a `requestId` retry starts a fresh turn.
- [ ] Contract tests cover NULL-lease reaping in both adapters.
- [ ] A single failed `renewTurnLease` no longer interrupts generation (unit test with a flaky port).
- [ ] Concurrent sweeps still reap exactly once (existing test still green).

## Verification

```sh
npm test -- turn-lease
npm test -- turn-reaper
npm run test:db:container
npm run verify
```
