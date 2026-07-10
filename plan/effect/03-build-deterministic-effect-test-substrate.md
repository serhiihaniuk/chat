# Step 03: Build the Deterministic Effect Test Substrate

Read this when: converting contract tests to Effect-native service provision, virtual time, scoped resources, and deterministic concurrency.

Source of truth for: the test Layer strategy and reusable deterministic service/resource doubles.

Not source of truth for: production Layer composition, which belongs to Step 08.

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 02

Unblocks: Steps 04-16

## Outcome

Effect tests can provide the smallest service environment, advance virtual time, control IDs and streams, inspect typed failures, and prove resource release without wall-clock sleeps or global mutable state. Later steps can be developed with red-green evidence.

## Target substrate

- `@effect/vitest` is the default for Effect-returning tests.
- `TestClock` drives schedules, timeouts, retries, lease heartbeats, reapers, host polling, and title deadlines.
- Neutral test primitives control time, Deferreds, streams, IDs, resource acquisition/release, and scripted state without predefining service tags that belong to later steps.
- Service-specific Test Layers and typed failures are added beside their final contracts in Steps 04-08 rather than introduced temporarily here.
- Resource probes record acquisition, release, interruption, and active listener/work counts.
- Each test owns its runtime/scope; no shared singleton leaks state between tests.

## Implementation sequence

1. Verify the selected `@effect/vitest` API from Step 01. Record the exact imports for Effect tests, scoped tests, Layer provision, live clock escape hatches, and TestClock adjustment.
2. Create neutral reusable primitives: finite deterministic value sequences, scripted Effect/Stream controls that can emit/block/fail/observe interruption, controllable notification signals, Deferred synchronization helpers, and resource probes with acquisition/finalization counters.
3. Provide generic scoped test Layers only for Effect's built-in/test-runtime facilities. Do not invent temporary product service tags or final error classes before Steps 04-06 define them.
4. Convert tests with raw delays, fake timer APIs, custom `ClockPort`, or polling sleeps to TestClock. The test should start the fiber, yield until it is waiting, advance time, and inspect the outcome.
5. Add helpers for eventual virtual-time assertions only if repeated. Avoid a generic test DSL that hides whether a fiber is waiting, interrupted, or complete.
6. Add resource lifecycle tests using scoped fixtures:
   - acquire then release;
   - acquire A, fail B, release A;
   - shared/memoized Layer acquires once per runtime;
   - two runtimes do not share mutable services;
   - dispose is idempotent at the application handle even if the underlying runtime rejects a second direct disposal;
   - an interrupted stream releases its provider permit/listener probe.
7. Add generic Cause/Exit assertion helpers that preserve failure, defect, and interruption. Step 04 extends them for final product error tags.
8. Remove obsolete clock/test fixture helpers once all callers use the new substrate. Do not keep two timer systems.

## Likely affected areas

- root Vitest configuration only if selected Effect v4 requires setup
- `packages/partner-ai-core/src/testing/**` or nearest test-support module
- `packages/agent-runtime/src/testing/**`
- `apps/partner-ai-service/src/testing/**`
- existing tests using `Effect.runPromise`, raw sleeps, `ClockPort`, or manual scopes

Production modules should not import test helpers. Use package exports for test support only when another workspace legitimately consumes a conformance suite; otherwise keep helpers private.

Create the substrate demonstrations in `packages/partner-ai-core/src/testing/effect-test-substrate.test.ts`. Package-specific neutral controls remain under each existing `src/testing` directory.

## Required demonstrations

Write focused tests proving:

1. a retrying operation completes after two virtual delays without waiting in real time;
2. a timeout wins deterministically and interrupts the loser;
3. scoped acquisition releases after test completion and after failure;
4. two provided service implementations can run the same workflow contract;
5. ID exhaustion is visible rather than returning random fallback data;
6. a blocked scripted stream observes interruption on cancellation.

## Failure meaning

- a test that needs `Effect.runPromise` inside the operation under test indicates a missing runtime boundary;
- a test that needs real time indicates an unconverted clock/timer boundary;
- a release counter mismatch indicates ambiguous ownership or a non-scoped constructor;
- shared state between tests indicates Layer memoization/runtime scope is incorrect;
- a test primitive importing a not-yet-final product service indicates this step crossed into Steps 04-08.

## Verification

Run the new demonstrations directly, then all packages touched by the helpers:

```powershell
npm test -- packages/partner-ai-core/src/testing/effect-test-substrate.test.ts
npm run typecheck
npm run lint:oxlint
npm run lint:custom
```

The focused test log must show no dependence on wall-clock sleeps. Run relevant suites repeatedly if concurrency nondeterminism was removed.

## Completion checklist

- [ ] Selected-version `@effect/vitest` and TestClock APIs are recorded.
- [ ] Neutral deterministic sequences, Stream/Deferred controls, notification signals, and resource probes exist.
- [ ] The six required demonstrations pass.
- [ ] Tests assert generic Exit/Cause outcomes and interruption without temporary product error tags.
- [ ] No new global singleton or cross-test state exists.
- [ ] Replaced raw-time/manual-scope test helpers are deleted.
- [ ] Targeted tests and repository static gates pass.
- [ ] `STATUS.md` records helper locations and evidence.

## Handoff record

Test helper entry points: pending

Remaining real-time tests and owning steps: pending

Verification: pending
