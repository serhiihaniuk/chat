# Step 02b: Workflow Compatibility Gate

Read this when: proving whether the retained foundation can carry Side Chat's durable execution contract.

Source of truth for: permanent durability/cancellation tests, measurements, the execution-substrate verdict, and fallback cutover if required.

Not source of truth for: approval implementation (Step 12), final reconnect behavior (Step 07), production lifecycle smoke (Step 19), or AI SDK 7 adoption, which is already settled.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 02a. Unblocks: Step 03.

## Outcome

Permanent integration tests prove the load-bearing self-hosted Workflow guarantees on the actual new service. The tests remain in the repository and run on Workflow dependency upgrades. Their verdict selects only the execution substrate:

- **workflow:** retain WorkflowAgent, Nitro, Postgres World, durable replay, and multi-instance continuation;
- **fallback:** remove Workflow-only foundation code and dependencies, keep the same AI SDK 7 service, and implement `ToolLoopAgent` request-bound single-instance execution. Do not keep both implementations and do not restore the custom runtime.

## Permanent acceptance tests

Use scripted, blocking providers and disposable Postgres. Each test owns its child processes and terminates them.

1. **Build and boot:** compiled monorepo service boots, worker becomes ready, and one turn completes repeatedly.
2. **Hard crash recovery:** kill the owner process during a model step; after restart, the run reaches terminal without a new user request. Record at-least-once behavior and any repeated model charge/text implication.
3. **Cross-instance continuation:** start on instance A, kill A, continue worker/stream access on instance B using the same Postgres world.
4. **Reconnect coherence:** attach with verified `startIndex` values after interruption and prove replay plus live tail normalizes to one coherent UI message with one terminal.
5. **Prompt cancellation:** use the Workflow-supported distributed/cross-process abort pattern to deliver an `AbortSignal` into `WorkflowAgent.stream`; verify the provider observes abort promptly, no later content is accepted, and a cancelled terminal is persisted. A stop hook or `run.cancel()` alone is insufficient because Workflow documents that the underlying step may continue.
6. **Lifecycle hygiene:** repeated boot/dispose and failed boot leave no worker, pool, listener, child process, or port behind.

## Measurements, not gates

Record but do not turn into architecture-selection criteria:

- workflow rows and bytes per representative turn and per hook wait;
- write flush interval and notification volume;
- worker pickup/recovery latency;
- idle worker memory/CPU;
- `workflow inspect` usefulness;
- behavior when a hook result arrives before the hook exists;
- deploy/rebuild behavior while a run is active.

These measurements seed Steps 07, 10, 11, 18, and 19. Expensive journal behavior is addressed with configuration, coalescing, archiving, and pruning unless it makes the substrate objectively unable to meet a stated capacity target.

## Verdict rule

Apply Step 01's five acceptance invariants mechanically. A failure selects fallback only after:

1. the reproduction is deterministic;
2. documented configuration and one bounded root-cause attempt have been tried;
3. the exact failure and remaining risk are recorded;
4. the fallback deletion patch removes Workflow-only code rather than adding a bridge.

Approval gaps, telemetry gaps, write amplification, or deploy constraints are routed to their owning steps and cannot select fallback alone.

Record the verdict in [`STATUS.md`](./STATUS.md) and append it to the architecture ADR. Update [`KNOWLEDGE.md`](./KNOWLEDGE.md) with confirmed runtime facts.

## Verification

```powershell
npm test -- apps/side-chat-service/src/foundation
npm run test:service:compatibility
npm run typecheck
npm run build
npm run lint:custom
```

## Completion checklist

- [ ] All six permanent acceptance areas pass, or a deterministic load-bearing failure is recorded.
- [ ] Provider abort is observed; cancellation is not inferred from run status alone.
- [ ] Cross-instance and reconnect assertions inspect user-visible stream coherence.
- [ ] Measurements are recorded and routed to owning steps.
- [ ] Exactly one execution substrate remains in the new wing.
- [ ] ADR, status board, and knowledge base carry the verdict and evidence.

## Handoff record

Verdict and evidence: pending

Crash/cross-instance/reconnect findings: pending

Cancellation mechanism and provider-abort timing: pending

Rows/bytes, pickup latency, and idle overhead: pending

Hook-before-creation and deploy observations: pending
