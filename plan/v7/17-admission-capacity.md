# Step 17: Admission and Capacity Control

Read this when: implementing the bounded-load model behind Step 05's `admitTurn()` seam.

Source of truth for: admission mechanics, slot lifecycle, overload mapping, and capacity configuration.

Not source of truth for: shutdown/drain (Step 19) or metrics emission (Step 18 — this step exposes counters, Step 18 wires them).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Steps 05, 11 (all slot-consuming paths exist). Unblocks: Steps 18, 19.

## Outcome

Load is chosen, not discovered: a bounded count of concurrently generating turns with a bounded queue, rejection as a typed safe outcome, and slot lifecycle correct across every exit path — including workflow suspension. The costly unit is the concurrently generating turn (`KNOWLEDGE.md` §Scale model); provider rate limits bind before infrastructure, so this bound is what keeps the provider bill and the DB write rate intentional.

## Target design

- **Mechanism**: plain-TS counting semaphore + FIFO wait queue (~30–50 lines, no framework) implementing `admitTurn(): Promise<ReleaseHandle>`; config: `capacity { maxActiveTurns, queueSize, queueTimeoutMs }` (validated since Step 03; defaults 16/32/5s).
- **Acquisition**: in the Step 05 route order — after policy checks, **before any durable write**, so rejection leaves zero residue.
- **Release**: tied to the turn's terminal transition (Step 09's guarded transition), not to request lifetime — the HTTP response can end while the durable run continues. Every exit releases exactly once: complete, fail, cancel, timeout.
- **Suspension policy**: a run suspending on a hook/approval **releases its slot** and re-acquires on resume. If the local queue times out, the workflow durably sleeps with bounded jitter and retries admission without holding a worker/generation slot; it fails only when the turn's total durable deadline expires. Transient local saturation must not destroy a resumable run.
- **Overload mapping**: queue full or queue timeout → HTTP 503, the Step 01 capacity code, `Retry-After: 5`—mapped before any stream starts.
- **Worker alignment**: `WORKFLOW_POSTGRES_WORKER_CONCURRENCY ≥ maxActiveTurns + headroom` (resumes/timeouts); one cross-field validation ties them; both recorded together.
- **Provider partitions**: do not build them in this program. One generation semaphore is the foundation; add provider-specific partitions only from measured quota pressure in a later plan.
- Counters exposed (consumed by Step 18): admitted, queued, rejected, active, queue-wait duration, suspension releases/re-acquisitions.

## Edge cases (each a test)

1. N+1th turn queues; queue timeout → 503 with `Retry-After`, **zero durable residue**;
2. queue full → immediate 503, zero residue;
3. cancel while queued → waiter removed, no slot consumed, no residue;
4. release on every terminal path — after a mixed batch (complete/fail/cancel/client-tool timeout), active count returns to zero;
5. suspension releases the slot: an instance saturated with suspended approvals still admits new turns;
6. resume re-acquires; resume under saturation follows the recorded decision;
7. deterministic concurrency stress: scripted blocking providers saturating admission — queue ordering (FIFO), timeout behavior, and counter consistency over repeated runs;
8. release is idempotent in production; a second release emits a counter and throws in tests/development so lifecycle defects cannot hide;

## Verification

```powershell
npm test -- apps/side-chat-service/src/capacity
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
```

## Failure meaning

- Any turn generating without a slot → a second entry point bypasses the seam; find and close it before proceeding.
- Active count not returning to zero → a terminal path misses release; treat as a leak, not test noise.

## Completion checklist

- [ ] Semaphore + queue behind `admitTurn()`; overload contract implemented.
- [ ] Slot release tied to terminal transition; suspension/resume policy implemented and recorded.
- [ ] Worker-concurrency cross-field validation.
- [ ] All eight edge cases + stress test pass.
- [ ] Counters exposed for Step 18.

## Handoff record

Limits applied and rationale: pending

Suspension/resume retry evidence: pending

Stress results: pending
