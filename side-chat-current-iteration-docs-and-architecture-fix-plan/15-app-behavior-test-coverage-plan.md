# App Behavior Test Coverage Plan

## 1. Goal

Add tests that prove launched app behavior, not only extension seams with fake
ports. The test suite should fail when production-like config silently uses
no-op memory, RAG, or research, and it should prove history/context behavior on
the real service path.

This plan covers audit gap `4.7`.

## 2. Current gap

Existing tests are valuable seam tests. Many inject fake adapters directly:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
```

They prove ports and context boards can carry data. They do not prove the
default launched app has a concrete source for memory, RAG, research, or
conversation-history context.

## 3. Test lanes

| Lane              | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| Config unit tests | Validate disabled/no-op/configured states and fail-closed production-like config. |
| Composition tests | Prove config selects concrete adapters and manifest declarations.                 |
| Service app tests | Prove HTTP app behavior and persistence boundaries.                               |
| Adoption harness  | Prove cross-package integration without relying on private internals.             |
| Widget harness    | Prove user-visible continuity and reset behavior.                                 |
| Persistent E2E    | Prove service plus DB plus widget paths survive restart when relevant.            |

Use the narrowest lane first. Do not turn every seam test into a browser test.

## 4. Implementation sequence

1. Name default behavior tests.

   Add tests that assert default local behavior reports memory/RAG/research as
   disabled or no-op. The point is not to make no-op illegal everywhere; the
   point is to make it visible.

2. Add production-like fail-closed tests.

   A production-like profile must fail config/composition when a capability is
   enabled without a concrete adapter or required source.

3. Add configured adapter path tests.

   Use small deterministic concrete adapters to prove service composition wires
   enabled memory, RAG, research, history, and context budget settings.

4. Add follow-up history behavior test.

   Prove turn N+1 receives prior turn context according to the selected strategy
   and reset prevents old context from entering later requests.

5. Add memory persistence behavior test after memory exists.

   Prove write candidates persist and recall on a later turn through configured
   persistence.

6. Add RAG app-path behavior test after RAG exists.

   Prove an enabled retrieval source produces candidates in the manifest and
   context board.

7. Add research app-path behavior test only if research is implemented.

   Prove research output enters prepared context and artifacts according to
   policy.

## 5. Required assertions

Tests should assert these boundaries:

```txt
runtime receives prepared context, not DB rows or protocol DTOs
widget receives protocol events, not runtime/provider/private context
disabled policies do not call adapters
enabled production-like capabilities cannot resolve to no-op silently
history and memory remain distinct in test names and fixtures
reset clears future history influence
context budget can drop lower-priority candidates
```

## 6. Fixtures

Prefer tiny deterministic fixtures:

```txt
recording MemoryPort
in-memory concrete memory repository
single-source RagRetrieverPort with fixed candidate output
recording ResearchAgentPort
test AgentExecutor that records AgentRuntimeRequest
```

Avoid fake providers for tests whose purpose is service composition or context
admission. Use a test executor to inspect prepared runtime input without calling
OpenAI.

## 7. Verification commands

Run narrow tests first, then repo gates matching the touched area:

```txt
npm test -- --run apps/partner-ai-service/src/config/service-config.test.ts
npm test -- --run apps/partner-ai-service/src/composition/service-composition.test.ts
npm test -- --run apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
npm test -- --run test-harness/adoption-harness/src/adoption-golden-path.test.ts
npm run test:e2e, when widget-visible behavior changes
npm run test:e2e:persistent, when DB plus service plus widget persistence changes
```

Use the pinned runtime command from `README.md` if the shell does not already
match Node `24.16.0` and npm `11.15.0`.

## 8. Documentation updates

Update:

```txt
docs/operations/verification.md, only for new durable lanes or commands
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Do not document fake adapter tests as proof of production-ready capability.

## 9. Acceptance criteria

```txt
[ ] A test fails if default production-like config silently uses no-op memory.
[ ] A test fails if enabled RAG has no retrieval source.
[ ] A test fails if enabled research has no concrete agent.
[ ] A test proves history is included in a follow-up turn.
[ ] A test proves memory recall/write survives through configured persistence.
[ ] Tests clearly separate seam behavior from launched app behavior.
```
