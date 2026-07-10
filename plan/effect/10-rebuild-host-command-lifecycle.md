# Step 10: Rebuild the Host-Command Lifecycle

Read this when: replacing host-command polling, notification resolution, timeout, abort, and persistence coordination.

Source of truth for: exactly-once host-command wait semantics and scoped resolver state.

Not source of truth for: public host-command DTOs. Preserve `sidechat.v1` schemas and route ownership unless a separately approved change is required.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 09

Unblocks: Steps 11-16

## Outcome

Host-command execution has one Effect-native lifecycle. Each pending command is registered once, can resolve from an HTTP notification or persisted-result polling, and completes exactly once by result, timeout, abort/interruption, or terminal failure. Resolver state and poll fibers are bounded, scoped, and cleaned on every outcome. Promise and AbortSignal adaptation exists only at the AI SDK tool callback boundary.

## Target model

For each command identity:

- a keyed `Deferred` represents the single completion result;
- a keyed `FiberMap` owns any poll/reconciliation fiber;
- a schedule controls persistence polling;
- timeout uses Effect timeout semantics;
- interruption represents cancellation/shutdown;
- registration and removal are scoped/finalized;
- notification and polling compete to complete the same Deferred;
- a persisted result found before/after notification yields the same domain result;
- duplicate/late completion is benign, observable at debug level if useful, and never runs the tool twice.

Verify exact selected-version Deferred/FiberMap/Schedule APIs. Do not infer beta.70 signatures.

## Semantics to decide before editing

1. Define the authoritative command key and ownership checks: tenant/workspace, conversation, turn, tool call, and command identity as required by current protocol.
2. Define timeout start: command emission, resolver registration, or AI SDK wait start. Prefer the earliest point that represents user-visible wait and can be measured consistently.
3. Define persisted result precedence and idempotency for duplicate HTTP submissions.
4. Define behavior if the “command emitted” persistence record fails. Recommended target is fail closed before awaiting, or enter a clearly tested degraded mode; never swallow it.
5. Define cleanup of a result that arrives after the waiting tool has timed out or been cancelled.
6. Define the atomic reservation seam Step 12 will use for global/per-turn pending-command capacity. This step does not choose or enforce final limits.

Record the decisions in `KNOWLEDGE.md` if they affect later capacity, retry, or protocol behavior.

## Implementation sequence

1. Extend Step 02 race tests so notify, poll, timeout, abort, and duplicate result can be released in every meaningful order under TestClock.
2. Define a `HostCommandResolver` Effect service with operations for await/register and notify/complete. Do not expose internal maps or Promise methods.
3. Acquire Deferred and poll-fiber registries in the resolver's scoped Layer.
4. Implement scoped registration. Deferred insertion and FiberMap registration are atomic from the resolver's perspective. Reject duplicate active command identities according to an explicit tag rather than replacing work silently.
5. Implement persistence polling with the configured schedule. Poll operations use the typed persistence adapter and distinguish not-found from failure.
6. Race Deferred completion with timeout and interruption. Ensure the losing poll fiber is interrupted and registration is removed.
7. Implement notification completion after route-level validation and ownership checks. The route persists idempotently, then notifies the resolver; a resolver miss must remain recoverable through polling/replay.
8. Make emitted-command persistence failure explicit. Add safe diagnostic and metric hooks without payload content.
9. Adapt the Effect operation to the AI SDK tool Promise callback in `packages/agent-runtime` or the existing service/runtime edge. Propagate AI SDK AbortSignal to Effect interruption and map the typed final result back to the tool result.
10. Expose one atomic registration/reservation operation for Step 12 to add pending-capacity policy without rewriting resolver state transitions.
11. Delete the old resolver's timers, mutable maps, manual scopes, dispatcher coupling, and duplicate Promise/abort wrappers.

## Contract tests

At minimum, test:

- notification wins before first poll;
- persisted result wins before notification;
- notification and poll race and complete once;
- duplicate HTTP result is idempotent and does not re-complete;
- timeout interrupts polling and deletes registry state;
- AbortSignal/interruption interrupts polling and deletes registry state;
- application shutdown interrupts all pending commands;
- late result after timeout is persisted/handled by the chosen policy without reviving the tool;
- emitted-record persistence failure follows the chosen fail-closed/degraded contract;
- ownership mismatch cannot resolve another tenant/workspace's command;
- notify-before-registration remains recoverable from durable state;
- sensitive command/result payloads do not appear in diagnostics.

Use TestClock and controlled Deferreds; no real polling delay.

## Likely affected areas

- `apps/partner-ai-service/src/adapters/host-commands/service-host-command-resolver.ts`
- `apps/partner-ai-service/src/adapters/host-commands/host-command-result-dispatcher.ts`
- `apps/partner-ai-service/src/inbound/http/routes/chat/turns/host-commands/**`
- runtime tool adapters under `packages/agent-runtime/src/runtime/ai-sdk/tools/**`
- host-command capability/tool registration composition
- persistence event/result adapters

## Verification

```powershell
npm test -- apps/partner-ai-service/src/adapters/host-commands
npm test -- apps/partner-ai-service/src/inbound/http/routes/chat/turns/host-commands
npm test -- packages/agent-runtime/src/runtime/ai-sdk/tools
rg -n 'setTimeout|setInterval|Promise\.race|AbortController|new Map|Scope\.make|Effect\.run' apps/partner-ai-service/src/adapters/host-commands packages/agent-runtime/src/runtime/ai-sdk/tools
npm run typecheck
npm run lint:custom
```

Document necessary boundary `AbortController`/Promise matches. Resolver-internal raw timer and run matches must be zero.

## Completion checklist

- [ ] Host-command identity, timeout origin, idempotency, late-result, and emitted-record policies are recorded.
- [ ] One scoped Effect service owns Deferred and poll-fiber state.
- [ ] Notify/poll/timeout/abort/shutdown races complete exactly once.
- [ ] Every outcome removes registration and interrupts losing work.
- [ ] Ownership is enforced and an atomic registration/reservation seam exists for Step 12 capacity.
- [ ] Promise/AbortSignal conversion exists only at the AI SDK callback edge.
- [ ] Old resolver timers/maps/scopes/wrappers are deleted.
- [ ] Race, privacy, type, and governance tests pass.
- [ ] `STATUS.md` records the final semantics and evidence.

## Handoff record

Final host-command semantics: pending

Effect service and AI SDK adapter entry points: pending

Capacity hooks for Step 12: pending

Verification: pending
