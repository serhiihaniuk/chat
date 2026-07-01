# ADR 0008: Crash Recovery — Durable Breadcrumbs Plus A Lease Sweep

Status: accepted 2026-07-02 (implementation tracked in `plan/05`, `plan/26`, `plan/07`)

## Context

Everything Effect guarantees in-process (ADR 0003) — `onExit` finalization,
interruption, scoped cleanup — covers every exit **the process survives**,
including graceful shutdown. A hard crash (OOM, `kill -9`, node panic, power)
is the one exit no finalizer runs for. That is a category, not an edge case,
and it needs its own answer.

What a crash leaves behind mid-turn: the fiber, the in-memory event registry,
and its SSE connections die with the process; the partial answer is lost
(accepted — ADR 0007). What survives in Postgres: the user message, the turn
row at `status='running'`, the owner lease, and any cancel intent. Untreated,
those durable leftovers are poison: the `requestId` can never be retried, the
conversation's `activeTurn` never clears, the "generating" dot burns forever,
and reconnecting clients hang.

## What it buys here

| Guarantee | How | Without it |
|---|---|---|
| **A crash cannot poison the next turn.** | Any surviving instance terminalizes the orphan; the `requestId` becomes retryable, `activeTurn` and the activity dot clear. | Stranded `running` rows block retries and light dots forever — today's state until `plan/05`. |
| **No split brain, ever.** | The lease carries an epoch; a reaped-then-awakened zombie owner's next heartbeat renew matches zero rows → it self-interrupts. Two instances can never both finish one turn. | A GC-paused owner waking up and double-answering. |
| **No leader election.** | The sweep uses CAS + `FOR UPDATE SKIP LOCKED`; every instance runs it concurrently with disjoint claims. | A coordinator service — new infrastructure for a background loop. |
| **Clients converge without knowing anything.** | The widget's fallback polls `GET /chat/turns/:id` — a plain DB read valid on any instance — then hands off to history. | Permanent spinners and locked composers. |
| **Honest terminals.** | The sweep classifies from durable evidence: cancel intent → `user_aborted`, else `provider_failed`; the reap emits the activity NOTIFY so dots clear live. | Every crash reported as a generic mystery. |

## Decision

**The principle:** any guarantee that must survive a crash is anchored in
Postgres; in-memory state is only ever a latency optimization; recovery is
always *another process noticing durable breadcrumbs* — never the dying
process cleaning up after itself.

**The mechanism, in layers:**

1. **Don't crash for stupid reasons.** DB blips must degrade, not kill:
   `error` handlers on the pool and LISTEN clients, reconnect loops with
   durable-intent rescan (`plan/26`). Most fleet "crashes" are this bug.
2. **Leases are the breadcrumbs.** Generation CAS-acquires an owner lease
   (`owner_instance_id`, `lease_epoch`, `lease_expires_at`) and renews it on a
   heartbeat. A dead owner simply stops renewing.
3. **The sweep is the recovery.** Every instance periodically runs
   `reapExpiredTurns`: expired ≡ `running` with a past lease, **or** a NULL
   lease older than a grace window (the crash-between-insert-and-acquire
   case). Reaped turns get honest classification and the activity NOTIFY, in
   one transaction (`plan/05`).
4. **Fencing closes the zombie case.** The sweep bumps `lease_epoch`; a
   stalled owner that wakes up fails its epoch-guarded renew and
   self-interrupts. Heartbeat renews retry transient DB errors first, so one
   blip cannot fence a healthy turn.
5. **Clients converge through the DB.** Stream lost → bounded reconnect →
   poll turn status on any instance → on terminal, refetch history and clear
   the run (`plan/07`, `plan/06`).

**The timeline this yields:** crash at t=0 → lease expires (~TTL 30 s) → swept
within the reaper interval + grace → client poll shows an honest failed state
seconds later. Roughly 30–60 s from crash to a calm, retryable failure —
tunable via `leaseTtl` / `reaperInterval` in `sidechat.config.ts`.

## Alternatives rejected

- **Relying on `onExit` alone** — the category error this ADR exists to
  prevent: finalizers cannot run in a process that no longer exists.
- **A durable event log / generation checkpointing** — resumes the *answer*,
  not just the state; built once and removed as too heavy (ADR 0007). The
  user re-asking is the accepted trade.
- **A durable-execution/workflow engine** — real crash-resume, at the cost of
  an infrastructure dependency this feature-sized product does not justify.
- **A leader-elected reaper** — coordination machinery `SKIP LOCKED` makes
  unnecessary.
- **"A restart clears it"** — it does not; the poison rows are durable. Doing
  nothing is a decision, and the review measured its cost.

## Consequences

Crash recovery costs one background loop per instance plus a heartbeat UPDATE
per running turn per 10 s — machinery that is already written and race-tested
in `packages/db` (`turn-lease.ts`; concurrent-reap exactly-once contract
tests). Until `plan/05` wires the loop, the lease writes are pure cost and
crashes strand turns — the docs flag this honestly
([assistant-turn.md](../architecture/assistant-turn.md) "Durability and crash
recovery"). Each `turn_reaped` observation flows to the telemetry sink
(ADR 0011), so operators can alarm on reap rate — a rising rate means
instances are dying, which is the signal to go look at layer 1.
