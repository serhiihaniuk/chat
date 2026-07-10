# Step 02: Freeze Behavioral Contracts

Read this when: preparing safety rails before changing services, Layers, resources, errors, or runtime composition.

Source of truth for: the observable behavior that the rewrite must preserve and the reusable contract-suite structure.

Not source of truth for: implementation shape. Tests in this step must remain valid across the old and target architectures.

Status: `not_started`

Owner: unassigned

Depends on: Step 01

Unblocks: Steps 03-16

## Outcome

The repository has behavior-first characterization and conformance tests for every load-bearing workflow. They expose accidental regressions during the rewrite without locking in `StreamChatPorts`, factory names, manual scopes, or other legacy internals.

## Contracts to freeze

### AI runtime conformance

Cover provider/executor selection, provider-native part mapping to `RuntimeEvent`, tool-loop behavior, tool failure, cancellation, terminal outcomes, usage, and rejection of invalid stream order. Assert that no provider DTO crosses the `agent-runtime` export boundary.

Run the same suite against the fake/scripted runtime and every supported AI SDK provider adapter where deterministic models exist. Do not call real providers.

### Stream-chat workflow conformance

Cover authorization, request validation, policy, turn guards, busy/lease behavior, context admission, runtime drain, event persistence, title isolation, usage persistence, terminal state, and interruption. Assert exactly one terminal outcome and no output event after terminalization.

### Service lifecycle and streaming conformance

Cover HTTP status/protocol mapping before the SSE stream starts; replay followed by live delivery; dense sequence ordering; slow subscriber/drop reconciliation; disconnect; explicit cancel; host-command result submission; app start; app shutdown; reaper behavior; and notification-source failure.

### Resource lifecycle probes

Cover release after successful acquisition, release after later acquisition fails, release exactly once, caller-owned resource preservation, Layer memoization, independent runtime isolation, repeated application dispose, and no listener/fiber activity after disposal.

## Implementation sequence

1. Inventory existing tests under `packages/agent-runtime`, `packages/partner-ai-core`, `apps/partner-ai-service`, and `packages/db`. Map each required behavior to existing coverage or a gap.
2. Create reusable contract-suite helpers close to the owning package's test support. A suite accepts public constructors/services and observable probes; it must not import private legacy factories solely to inspect them.
3. Expand the neutral traces captured before Step 01's version change into durable reusable contract tests. If current behavior is clearly a defect or contradicts a canonical contract, record it as an intentional target correction rather than freezing it silently.
4. Add deterministic scripted input for provider streams, notification sources, repository operations, host results, clocks, and IDs. Step 03 will convert time and Effect-service mechanics; this step may add neutral scripts and probe interfaces.
5. Define event traces and terminal invariants in data-driven assertions. Prefer a compact trace such as event type, sequence, and terminal state over large snapshots.
6. Add explicit regression tests for known risk points:
   - app-owned Postgres resources are expected to close on app shutdown;
   - an injected repository must not be closed by the app;
   - title generation cannot prevent terminal turn completion;
   - provider failure after emitted output is not retried;
   - host command completes once under notify/poll/timeout/abort races;
   - start-response and resumed-SSE disconnect interrupt only request/subscription work while server-owned generation continues;
   - explicit durable cancel, lease loss, and application shutdown interrupt generation;
   - no duplicated live event appears after replay handoff.
7. Mark currently failing target-state tests as explicit, narrowly scoped pending tests only when the old architecture cannot satisfy them. The test name must state the future step that enables it. Do not skip current-behavior tests.
8. Document each suite's seam, fixtures, observable contract, and failure meaning in package test-support comments or a nearby README only when needed for discoverability.

## Likely files and seams

- `packages/agent-runtime/src/testing/**`
- `packages/agent-runtime/src/runtime/**/*.test.ts`
- `packages/partner-ai-core/src/application/stream-chat/**/*.test.ts`
- a new core conformance helper under the nearest `src/testing` or application test-support folder
- `apps/partner-ai-service/src/testing/**`
- `apps/partner-ai-service/src/inbound/http/streaming/**`
- `apps/partner-ai-service/src/composition/service-composition*.test.ts`
- `packages/db/src/testing/**`

Do not introduce a cross-package test utility package unless duplication proves a real ownership problem. Package-local conformance helpers are usually clearer.

## Test design rules

- Assert public output, persistent records, emitted events, interruption, release probes, and safe diagnostics.
- Do not assert exact Layer node counts, internal Context map shape, fiber IDs, or private combinator choice.
- Prefer explicit builders over giant fixture objects.
- Keep time and scheduling assertions deterministic; Step 03 must remove any remaining wall-clock delay.
- Do not lower coverage by replacing precise assertions with snapshots.
- Avoid real database/provider tests in the default suite. Database resource behavior can use a disposable container only in its documented integration command.

## Verification

Run each new suite directly while authoring, then:

```powershell
npm test -- packages/agent-runtime
npm test -- packages/partner-ai-core
npm test -- apps/partner-ai-service
npm test -- packages/db
npm run typecheck
npm run lint:custom
```

Use the repository's actual Vitest filtering syntax if a directory argument does not select as expected. Record exact passing commands.

## Completion checklist

- [ ] The four reusable suite families exist or are explicitly mapped to equivalent existing helpers.
- [ ] Every contract listed above has a passing current-behavior test or a named target-state test assigned to a later step.
- [ ] Tests do not depend on the intended Layer implementation.
- [ ] Known current defects are recorded, not normalized as desired behavior.
- [ ] No real provider or persistent database call is part of the default suite.
- [ ] Targeted suites, typecheck, and custom governance pass.
- [ ] `STATUS.md` links the coverage map and test results.

## Handoff record

Coverage map: pending

Intentional target corrections: pending

Pending tests and enabling steps: pending

Verification: pending
