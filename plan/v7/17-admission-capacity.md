# Step 17: Admission and Capacity Control

Read this when: implementing the bounded-load model behind Step 05's `admitTurn()` seam.

Source of truth for: admission mechanics, slot lifecycle, overload mapping, and capacity configuration.

Not source of truth for: shutdown/drain (Step 19) or metrics emission (Step 18 — this step exposes counters, Step 18 wires them).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 11 (all slot-consuming paths exist). Unblocks: Steps 18, 19.

## Outcome

Load is chosen, not discovered: a bounded count of concurrently generating turns with a bounded queue, rejection as a typed safe outcome, and slot lifecycle correct across every exit path — including workflow suspension. The costly unit is the concurrently generating turn (`KNOWLEDGE.md` §Scale model); provider rate limits bind before infrastructure, so this bound is what keeps the provider bill and the DB write rate intentional.

## Important investigation before implementation

Do not treat the target design below as approved implementation until this investigation is complete:

- **Originating-tab regression:** the Effect implementation supported multiple service instances through PostgreSQL `LISTEN/NOTIFY`, while its live connection ensured that a browser-executed UI tool landed only in the tab that requested it. Determine whether native replay can expose one unresolved client-tool call to several open tabs. Record the current behavior and the smallest way to preserve originating-tab affinity; do not silently accept execution by another tab.
- **Engine ownership:** verify the pinned Workflow/Postgres World worker, queue, concurrency, backpressure, suspension, and resume controls before building a first-party semaphore or retry loop. The migration was chosen partly so durable execution support and future engine features remain upstream responsibilities. Add custom capacity machinery only for a product/provider admission policy the engine demonstrably does not own.
- **Migration value:** estimate the first-party production code added by Step 17 and compare it with the old capacity/lease/reaper machinery scheduled for deletion. The completed migration is expected to reduce first-party code and support burden materially, not recreate the engine beside Workflow in plain TypeScript.

Record the evidence and resulting decision in this step before implementation. This section is an investigation marker, not a decision that the proposed semaphore design is required.

## Investigation decision (2026-07-16)

The investigation changes the initial target in two material ways.

### Native engine capacity ownership

The pinned `workflow@5.0.0-beta.30` and `@workflow/world-postgres@5.0.0-beta.24` stack already owns the durable Graphile queue, redelivery, retries, delayed scheduling, suspension without compute consumption, and resume through that queue. `PostgresWorldConfig.queueConcurrency` / `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` bounds all workflow and step jobs in one service process; provider generation is a Workflow step through `@ai-sdk/workflow`. The engine does **not** expose a bounded producer queue, enqueue timeout, pre-write HTTP rejection, provider-only partition, or product admission counters.

A route-held local lease cannot observe hook suspension, move to the replica that resumes a run, or survive process restart. Releasing and durably re-acquiring that lease would recreate distributed lease, retry, heartbeat, and reaper machinery beside Workflow. The removed legacy implementation was at least 660 production lines before schemas, ports, configuration, composition, and tests; the complementary local ingress gate is expected to remain roughly 140-210 production lines.

Decision:

- Side Chat owns a **per-service-process, pre-write ingress bound**: a plain-TypeScript FIFO gate with bounded waiting, typed overload, request-abort removal, and counters.
- An admitted reservation is conservatively held until the durable turn reaches a terminal outcome. Suspended turns therefore continue to count against ingress capacity; this is intentionally an accepted-turn bound, not a claim that the local process owns provider execution slots.
- Workflow exclusively owns worker-slot release on suspension, durable sleep/retry, resume, redelivery, and processing backpressure. Side Chat will not add a second durable reservation system.
- `WORKFLOW_POSTGRES_WORKER_CONCURRENCY` is declared and cross-validated for operator visibility. `WORKFLOW_POSTGRES_MAX_POOL_SIZE` is declared and validated against the upstream `max(10, worker concurrency + 2)` recommendation.
- The configured global ingress ceiling is `replica count * maxActiveTurns`; a future exact cross-replica/provider partition requires either an upstream named queue or a separately approved distributed design.

### Originating-tab client-tool authority

Native replay currently exposes an unresolved client-tool call to every same-subject tab. Each widget automatically dispatches replayed `input-available` tools, while output ownership checks only workspace, subject, run, and tool call. PostgreSQL makes settlement idempotent but cannot undo duplicate browser side effects, and a watcher without the host capability can currently settle the call as unsupported before the originating tab responds.

Decision:

- A run that can execute client tools carries a high-entropy, run-scoped client-tool capability generated by the originating widget.
- Only a digest is persisted with client-tool dispatch state. The raw capability stays in the existing tab-scoped active-turn cursor and is sent only on the initial turn request and client-tool output request; it must not enter the Workflow journal, replay stream, logs, or telemetry.
- Same-subject watcher tabs retain transcript replay, but unresolved client tools are read-only without the capability: they do not invoke the host bridge and do not submit synthetic failures.
- The output endpoint validates the capability before reading the private result body and hides missing/mismatched authority behind the existing not-found outcome.

This is a newly enforced product/security contract. The legacy Effect implementation broadcast to connected subscribers and does not substantiate strict tab affinity.

## Target design

- **Mechanism**: plain-TS per-process counting semaphore + FIFO wait queue (no framework) implementing `admitTurn(): Promise<ReleaseHandle>`; config: `capacity { maxActiveTurns, queueSize, queueTimeoutMs }` (defaults 16/32/5s).
- **Acquisition**: in the Step 05 route order — after policy checks, **before any durable write**, so rejection leaves zero residue.
- **Release**: tied to the turn's terminal transition (Step 09's guarded transition), not to request lifetime — the HTTP response can end while the durable run continues. Every exit releases exactly once: complete, fail, cancel, timeout.
- **Suspension policy**: the local reservation remains held until terminal. Workflow releases its own worker slot when a hook suspends and durably requeues resume work. Side Chat does not mirror this lifecycle with a distributed lease.
- **Overload mapping**: queue full or queue timeout → HTTP 503, the Step 01 capacity code, `Retry-After: 5`—mapped before any stream starts.
- **Worker alignment**: `WORKFLOW_POSTGRES_WORKER_CONCURRENCY ≥ maxActiveTurns + headroom` (resumes/timeouts); `WORKFLOW_POSTGRES_MAX_POOL_SIZE ≥ max(10, worker concurrency + 2)`; cross-field validation records both relationships.
- **Provider partitions**: do not build them in this program. One generation semaphore is the foundation; add provider-specific partitions only from measured quota pressure in a later plan.
- Counters exposed (consumed by Step 18): admitted, queued, rejected, cancelled while queued, active, queue-wait duration, and duplicate releases. Engine suspension/worker-slot telemetry remains engine-owned.

## Edge cases (each a test)

1. N+1th turn queues; queue timeout → 503 with `Retry-After`, **zero durable residue**;
2. queue full → immediate 503, zero residue;
3. cancel while queued → waiter removed, no slot consumed, no residue;
4. release on every terminal path — after a mixed batch (complete/fail/cancel/client-tool timeout), active count returns to zero;
5. a suspended turn keeps its conservative ingress reservation while Workflow releases its worker slot;
6. resumed work uses Workflow's durable queue and does not acquire a second local ingress reservation;
7. deterministic concurrency stress: scripted blocking providers saturating admission — queue ordering (FIFO), timeout behavior, and counter consistency over repeated runs;
8. release is idempotent in production; a second release emits a counter and throws in tests/development so lifecycle defects cannot hide;

## Verification

```powershell
npm test -- apps/side-chat-service/src
npm test -- packages/side-chat-widget/src packages/db/src
npx tsc -p apps/side-chat-service/tsconfig.json --noEmit
npx tsc -p packages/side-chat-widget/tsconfig.json --noEmit
npx tsc -p packages/db/tsconfig.json --noEmit
npx tsc -p packages/stream-profile/tsconfig.json --noEmit
npm run lint:custom
```

## Failure meaning

- Any turn generating without a slot → a second entry point bypasses the seam; find and close it before proceeding.
- Active count not returning to zero → a terminal path misses release; treat as a leak, not test noise.

## Completion checklist

- [x] Semaphore + queue behind `admitTurn()`; overload contract implemented.
- [x] Slot release tied to terminal transition; engine-owned suspension/resume policy recorded and verified.
- [x] Worker-concurrency cross-field validation.
- [x] All eight edge cases + stress test pass.
- [x] Counters exposed for Step 18.
- [x] Originating-tab client-tool capability enforced without exposing the raw capability in durable or replayed data.

## Handoff record

Limits applied and rationale: 16 admitted / 32 queued / 5 seconds per process; the conservative ingress bound complements Workflow's process-wide worker concurrency without recreating its durable queue.

Suspension/resume retry evidence: pinned Workflow/Postgres World owns durable hook suspension and queue-based resume; a local cross-process reacquisition design was rejected.

Stress results: 25 deterministic saturated batches completed with 3 active turns and 17 FIFO waiters per batch (500 admissions total). Every batch ended with `active: 0`, the exact FIFO order, 20 admitted, 17 queued, zero rejected, and zero duplicate releases. Full replacement suites passed: service 379/379 (12 skipped), widget 430/430, and DB unit 26/26; the affected service, widget, DB, and stream-profile TypeScript projects compile cleanly.
