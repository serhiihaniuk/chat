# 3. App Behavior Test Coverage

## Goal

Lock the difference between extension seam tests and launched app behavior. Tests
should fail if production-like configuration silently uses no-op memory, RAG, or
research.

## Why Third

After status and config exist, tests can express the product contract before the
larger implementation phases add history, persistence, memory, and RAG behavior.

## Test Lanes

| Lane              | Purpose                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Config unit tests | Validate disabled, no-op, configured, and rejected partial states. |
| Composition tests | Prove config selects adapters and manifest declarations.           |
| Service tests     | Prove HTTP app behavior and persistence boundaries.                |
| Adoption harness  | Prove cross-package integration without private internals.         |
| Widget harness    | Prove user-visible continuity and reset behavior.                  |
| Persistent E2E    | Prove service plus DB plus widget paths when persistence changes.  |

## Implementation Steps

1. Add default status tests.

   Prove default local service status is explicit about disabled/no-op
   capability state.

2. Add fail-closed production-like tests.

   A production-like service should fail when a capability is enabled but no
   concrete adapter, source, or backend is configured.

3. Add configured composition tests.

   Use deterministic recording adapters to prove config reaches service
   composition and manifest construction.

4. Add request-inspection test executor.

   Use a test executor to inspect prepared runtime input without calling a real
   provider.

5. Keep seam tests and app-path tests separate.

   Test names should say whether they prove a port seam or launched service
   behavior.

6. Add phase-specific app-path groups as capabilities land.

   ```txt
   history: turn N+1 includes turn N; reset clears future context
   persistence: Postgres insert/update/history/context snapshot path works
   memory: enabled memory recalls and writes through configured service path
   RAG: enabled retrieval registers sources and emits manifest/runtime context
   context admission: budget pressure drops lower-priority candidates
   research: enabled research produces context/artifacts, if implemented
   ```

## Required Assertions

```txt
[ ] disabled policies do not call adapters
[ ] enabled production-like capabilities cannot resolve to no-op silently
[ ] runtime receives prepared context, not DB rows or browser protocol DTOs
[ ] widget receives protocol events, not runtime/provider/private context
[ ] history and memory remain distinct in fixture names
[ ] reset clears future history influence when history context is implemented
[ ] deterministic service tests inspect runtime request/context manifest instead of relying only on model wording
```

## Harness Expectations

Widget harness should prove user-visible behavior, but deterministic service
tests should prove exact context admission.

Suggested smoke:

```txt
1. Run configured service with durable persistence.
2. Send a first message that establishes a conversation fact.
3. Send a follow-up question in the same conversation.
4. Verify the model can answer based on prior turn context.
5. Restart service or create a fresh composition.
6. Verify history endpoint still returns persisted messages.
```

## Verification

Use narrow commands first:

```txt
npm test -- --run apps/partner-ai-service/src/config/service-config.test.ts
npm test -- --run apps/partner-ai-service/src/composition/service-composition.test.ts
npm test -- --run apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
npm test -- --run test-harness/adoption-harness/src/adoption-golden-path.test.ts
```

Run widget or persistent E2E only when the touched phase changes browser-visible
or DB-backed behavior.

## Exit Criteria

```txt
[ ] Tests fail if production-like memory silently uses no-op.
[ ] Tests fail if enabled RAG has no retrieval source.
[ ] Tests fail if enabled research has no concrete agent.
[ ] Tests can inspect prepared context without real provider calls.
[ ] Harness smoke proves normal chat continuity without being the only proof.
[ ] Test names distinguish seam behavior from launched app behavior.
```
