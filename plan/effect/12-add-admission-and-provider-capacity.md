# Step 12: Add Admission and Provider Capacity Control

Read this when: bounding turn starts, model streams, tools, host waits, or overload behavior.

Source of truth for: the server's pre-production capacity model and permit lifetime semantics.

Not source of truth for: deployment replica sizing. Capacity/deployment documentation must be updated from measured configuration after implementation.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 11

Unblocks: Steps 13-16

## Outcome

The service has explicit, validated bounds for admitted turns, queued starts, provider streams, tool executions, and pending host commands. Overload is a typed safe outcome. Permits are scoped to the resource lifetime they protect. No durable turn is marked running while merely waiting for local capacity.

## Capacity layers

### Turn admission

Use a bounded admission mechanism with a clear queue policy. Perform pure request validation, authority checks, policy/guard evaluation, and read-only ownership lookup first. Acquire admission before any conversation creation, user-message append, running-turn insert, lease/context snapshot, or event write. Queue timeout fails with `TurnCapacityError` and leaves no durable residue.

Prefer an admission queue plus owned workers when permit transfer to a detached turn fiber would otherwise be fragile. A semaphore is acceptable only if its acquisition scope provably spans the entire admitted workflow and request disconnect cannot release it early while generation continues.

### Provider execution

Use a semaphore or partitioned semaphore keyed by provider/model when configuration requires separate quotas. Acquire immediately before a concrete provider request and hold the permit until that provider request/stream reaches an observed terminal boundary. Returning a Stream value does not release it. A host/tool wait keeps the permit whenever AI SDK still owns the open provider request; never infer suspension from missing deltas or manually release/reacquire mid-stream.

### Tool execution

Bound concurrent runtime tools globally and optionally by category/tool when resource profiles differ. If AI SDK demonstrably closes one provider request before tool execution, that request permit releases at the observed close and the next model step acquires a new permit. Tool/host waits never manipulate provider permits directly.

### Pending host commands

Enforce global and per-turn pending-command bounds at resolver registration. Reject before storing unbounded Deferred/fiber state. The error must be safe and must clean up any partially emitted/persisted command according to Step 10 semantics.

## Configuration model

Add readable validated settings for:

- maximum active turns;
- admission queue size and wait timeout;
- provider/model concurrency limits and default;
- global/per-tool concurrency limits;
- global/per-turn pending host-command limits;
- shutdown drain budget;
- optional fairness/partition keys.

Use these explicit pre-production starting values:

- active turns per instance: 16;
- queued turn starts: 32;
- admission wait timeout: 5 seconds;
- default concurrent provider requests: 8, with optional lower per-provider/model overrides;
- concurrent runtime tools: 16 globally and 4 per tool key;
- pending host commands: 128 globally and 4 per turn;
- graceful drain budget: 20 seconds.

These values are safe bounded starting points, not production capacity claims. Before production, load evidence may change them through the readable config without changing architecture. Capacity rejection maps before streaming to HTTP 503 with stable safe code `turn_capacity` and a 5-second `Retry-After`; Step 12 updates `chat-protocol`/HTTP contract tests if the current envelope needs that new code.

Cross-field rules must reject impossible states such as zero workers with a nonzero queue, negative limits, queue timeout beyond request limits, or a provider key without a configured provider.

## Implementation sequence

1. Add the capacity ownership table to this file's handoff record: protected resource, acquisition point, release point, key, queue behavior, error, and selected default.
2. Add deterministic overload contract tests before enforcing limits.
3. Implement turn admission at the exact pre-write boundary above. If busy checking needs a conversation lookup, split read-only lookup/authorization from atomic `beginTurn` creation.
4. If using queue/workers, acquire them in a scoped capacity Layer and supervise workers. Ensure shutdown stops admission, drains within budget, then interrupts remaining work.
5. Implement provider permits inside `agent-runtime` around full stream consumption. Add a scripted stream that blocks after opening to prove the permit remains held.
6. Implement tool execution permits at the runtime tool executor boundary. Avoid holding unrelated locks while a tool waits on host input.
7. Make pending-capacity reservation, Deferred insertion, and FiberMap registration one atomic resolver transition. Cancellation/timeout releases the reservation and registry entry exactly once.
8. Expose current/queued/rejected counts through safe observability hooks. Step 14 adds native metrics.
9. Add fairness/starvation tests for partitioned limits and FIFO queue behavior if those are promised. Do not claim fairness from a primitive without testing selected-version semantics.
10. Update capacity/deployment and configuration docs with defaults, overload mapping, and permit lifetimes.

## Contract tests

- the N+1 active turn queues or fails exactly according to configuration;
- queue timeout returns the safe capacity mapping and leaves no running turn/lease/event residue;
- capacity rejection leaves no conversation, user message, turn, lease, context snapshot, or event residue;
- request cancellation while queued removes the waiter and consumes no permit;
- after admission transfers ownership to the detached turn fiber, start-response disconnect does not release capacity or cancel generation;
- shutdown rejects new admission and drains/interrupts queued/running work by policy;
- provider permit remains held while a returned stream is blocked and releases on completion/failure/interruption;
- one provider/model partition does not consume another partition's quota;
- tool permit releases on success, typed failure, defect, timeout, and interruption;
- pending host-command global/per-turn limits are enforced without registry leaks;
- notify-before-registration remains recoverable from durable state while registration/reservation is atomic;
- metrics/probes never become negative and return to zero after disposal;
- no starvation test fails for any documented fairness guarantee.

## Likely affected areas

- application settings/schema from Step 07
- turn admission and runner service from Step 09
- AI runtime provider execution and stream drain
- runtime tool executor
- host-command resolver
- Hono pre-stream error mapper
- `docs/operations/configuration.md`
- `docs/operations/capacity-and-deployment.md`

## Verification

Create admission/host capacity tests in `apps/partner-ai-service/src/inbound/turn-runner/turn-capacity.test.ts` and provider/tool permit tests in `packages/agent-runtime/src/runtime/runtime-capacity.test.ts`.

```powershell
npm test -- apps/partner-ai-service/src/inbound/turn-runner/turn-capacity.test.ts packages/agent-runtime/src/runtime/runtime-capacity.test.ts
npm test -- packages/agent-runtime
npm test -- apps/partner-ai-service/src/inbound/turn-runner
npm run typecheck
npm run lint:custom
```

Run a deterministic concurrency stress test with scripted blockers. Do not use a real provider to prove permit lifetime.

## Completion checklist

- [ ] A capacity ownership table documents every bound and permit lifetime.
- [ ] Admission occurs before durable active-turn state and has bounded queue behavior.
- [ ] Provider permits span full stream consumption.
- [ ] Tool and host-command bounds release on every Exit.
- [ ] Settings and cross-field validation are complete.
- [ ] Overload/cancel/shutdown/fairness tests pass deterministically.
- [ ] Capacity and configuration docs describe actual behavior.
- [ ] Type and governance gates pass.
- [ ] `STATUS.md` records selected defaults and stress evidence.

## Handoff record

Capacity ownership table: pending

Selected defaults and rationale: pending

Stress-test result: pending

Verification: pending
