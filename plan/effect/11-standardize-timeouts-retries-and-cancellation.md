# Step 11: Standardize Timeouts, Retries, and Cancellation

Read this when: centralizing resilience policy across leases, provider execution, titles, notifications, tools, and shutdown.

Source of truth for: operation-specific retry/timeout decisions and end-to-end cancellation propagation.

Not source of truth for: capacity admission or provider concurrency counts, which belong to Step 12.

Status: `not_started`

Owner: unassigned

Depends on: Step 10

Unblocks: Steps 12-16

## Outcome

Every timeout and retry is explicit, configured, typed, observable, deterministic under TestClock, and justified by idempotency. Cancellation flows from request/application scope through turn fibers, AI SDK AbortSignal, provider streams, tools, host waits, lease heartbeat, and persistence finalization. No generic retry wrapper or raw timer obscures policy.

## Required policy matrix

Before editing, create a table for every fallible remote/storage/wait operation with:

- operation and owner;
- timeout and when it starts;
- retryable tags/codes;
- maximum attempts/elapsed time;
- base/backoff/jitter schedule;
- idempotency proof;
- whether any output or side effect may already exist;
- cancellation cleanup;
- final safe error and telemetry signal.

Use the baseline table in `KNOWLEDGE.md`, but verify all current operations.

## Provider execution rule

Keep AI SDK `maxRetries: 0`. If the product adds provider retry, it is allowed only before the first `RuntimeEvent` or tool/side effect is observed and only for typed transient provider failures. Once any delta, reasoning activity, tool call, host command, usage side effect, or persisted provider event occurs, automatic turn retry is forbidden.

Implement this as an explicit state transition, not an assumption that opening a stream means nothing was emitted. The retry gate closes permanently on the first RuntimeEvent or any tool execution/host-command emission/other side effect, even if no event has reached the client. A retry creates a fresh provider attempt and permit.

## Title generation rule

Title generation is an auxiliary finalization job. Give it a validated timeout and an AbortController bridge to the AI SDK/provider boundary. Timeout/failure is observed safely and cannot hang or fail the main turn's terminal completion. Interrupt its fiber on application shutdown.

## Lease rule

Lease acquire/renew may retry only storage failures classified transient by the persistence adapter. Use a bounded jittered schedule. Lease loss/ownership conflict is a domain outcome, not a transient exception. Heartbeat stops promptly on turn completion, cancellation, or interruption.

## Notification and host-wait rule

Notification source reconnect uses a capped jitter schedule for classified transient source failures. Host polling uses its own fixed/backoff schedule and overall timeout; a not-found result is not a failure retry. These schedules must not share a generic “retry everything” helper.

## Implementation sequence

1. Build and review the policy matrix. Reject retry where idempotency or emission state is unclear.
2. Add validated settings for each policy. Defaults remain readable in the TypeScript config and are resolved by Step 07 services.
3. Create small named schedule constructors only when they encode a domain policy used more than once. Avoid a configurable universal retry builder.
4. Convert lease acquire/renew and notification reconnect to tag-filtered schedules with jitter and maximum bounds.
5. Add provider pre-emission retry state inside `agent-runtime`, keeping provider/AI SDK detail private. Preserve RuntimeEvent mapping and terminal semantics.
6. Convert title generation to a bounded Effect with AbortSignal propagation and non-blocking finalization outcome.
7. Verify host-command timeout/polling from Step 10 follows the matrix.
8. Trace the three interruption domains separately: pre-admission request cancellation stops request work; start-response/SSE disconnect stops only response/subscription work after admission; explicit cancel, lease loss, and application shutdown interrupt server-owned generation through runtime stream, AI SDK, tools, host wait, heartbeat, and terminal persistence.
9. Remove raw timers, duplicate AbortController bridges, unconditional retry helpers, and swallowed timeout errors in Effect-owned modules.
10. Add safe diagnostics hooks for attempt count, final reason, and elapsed bucket; Step 14 turns them into spans/metrics.

## Contract tests

- retryable lease failures retry the exact configured number under virtual time;
- non-retryable lease/domain errors fail immediately;
- retry delays include bounded jitter using a deterministic test random service if required by selected v4;
- provider transient failure before first event retries according to policy;
- provider failure after first event or any tool/host side effect never retries or duplicates the side effect;
- provider cancellation aborts the AI SDK stream and releases its resource;
- title timeout interrupts provider work and turn terminalization still succeeds;
- notification source transient failure reconnects; permanent failure follows readiness/fatal policy;
- host polling stops at timeout/abort without an extra poll;
- start-response and resumed-SSE disconnect leave admitted server-owned generation running;
- explicit cancel, lease loss, and shutdown interrupt generation and converge on one terminal lifecycle;
- shutdown interruption still runs required terminal/release finalizers within the shutdown budget.

## Likely affected areas

- lease helpers under `packages/partner-ai-core/src/application/stream-chat/protocol/lease/**`
- AI runtime/provider streaming under `packages/agent-runtime/src/runtime/**`
- conversation title modules in core and service/runtime adapters
- notification sources/dispatchers
- host-command resolver
- Hono stream/cancel adapters and application Layer settings

## Verification

```powershell
rg -n 'retry|maxRetries|timeout|setTimeout|setInterval|AbortController|AbortSignal|catchCause' packages/agent-runtime packages/partner-ai-core apps/partner-ai-service
npm test -- <retry-timeout-cancellation-contract-files>
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

Review every match against the policy matrix. A raw AbortController at an AI SDK boundary may be correct; a raw timer in an Effect-owned workflow is not.

## Completion checklist

- [ ] Every retry/timeout operation appears in the reviewed policy matrix.
- [ ] All retries filter typed errors and have bounded schedules plus idempotency proof.
- [ ] AI SDK retries remain disabled; product provider retry stops forever after first emission/side effect.
- [ ] Title generation is bounded and isolated from terminalization.
- [ ] Cancellation propagates across every listed edge and releases resources.
- [ ] Tests use virtual time and deterministic scheduling.
- [ ] Raw timers and duplicate abort/retry wrappers are removed from Effect-owned code.
- [ ] Targeted tests, typecheck, and governance pass.
- [ ] `KNOWLEDGE.md` and `STATUS.md` record the final policy matrix.

## Handoff record

Policy matrix location: pending

Remaining boundary timers/AbortControllers: pending

Cancellation trace evidence: pending

Verification: pending
