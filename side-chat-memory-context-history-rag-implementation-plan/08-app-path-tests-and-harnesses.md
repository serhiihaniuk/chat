# 08 — App-Path Tests and Harnesses

## Goal

Move from seam tests with fakes to app-path tests that prove the default/configured service behavior.

The audit says existing tests are useful because they prove extension seams can carry memory, RAG, and research through the context board. But they can mislead review because they do not prove the default launched app has concrete sources of that data.

## Test principle

Every capability should have both:

```txt
Seam test
  Proves the port/adapter contract can carry data.

App-path test
  Proves service config/composition wires a concrete or explicit disabled adapter.
```

A test that injects a fake directly into a context manager is not enough to prove the app behavior.

## Required test groups

### Capability status/config tests

Target:

```txt
apps/partner-ai-service/src/config/service-config.test.ts
apps/partner-ai-service/src/composition/service-composition.test.ts
```

Cases:

```txt
[ ] Default local config reports explicit disabled/noop memory/RAG/research.
[ ] Production-like config rejects enabled memory with no concrete adapter.
[ ] Production-like config rejects enabled RAG with no retrieval source.
[ ] Production-like config rejects enabled research with no concrete adapter.
[ ] Diagnostics contain capability state and adapter id, but no secrets.
```

### History behavior tests

Target:

```txt
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

Cases:

```txt
[ ] Turn N+1 includes Turn N according to history policy.
[ ] Disabled history policy includes no prior turns.
[ ] Reset removes prior turns from future model context.
[ ] History respects conversation/workspace boundary.
[ ] Runtime request or context manifest proves history inclusion deterministically.
```

### Postgres durability tests

Target:

```txt
test-harness/widget-harness/e2e/persistent.spec.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
packages/db/src/repositories/postgres-drizzle/**
```

Cases:

```txt
[ ] Postgres insert path works for conversation, user message, assistant turn, terminal update.
[ ] History survives service restart/fresh composition.
[ ] Context snapshot persists through Postgres path.
[ ] Service does not silently fall back to memory repository when database URL is configured.
```

### Memory app-path tests

Cases:

```txt
[ ] Enabled memory recalls via concrete adapter.
[ ] First turn can produce write candidates.
[ ] Auto-apply or approved candidates are persisted.
[ ] Later turn recalls memory through configured service path.
[ ] Disabled memory does not recall/write.
[ ] Memory failure is observable and does not produce a second terminal event.
```

### RAG app-path tests

Cases:

```txt
[ ] Enabled RAG config registers source manifest.
[ ] Retriever receives allowedSourceIds and auth/workspace scope.
[ ] Retrieved candidates enter context manifest and runtime context board.
[ ] Disabled RAG does not call retriever.
[ ] Retrieval failure mode degrade/fail_turn is tested.
```

### Context admission tests

Cases:

```txt
[ ] No-pressure includes all candidates.
[ ] Budget-pressure drops lower-priority candidates.
[ ] Source caps are enforced.
[ ] Dropped candidates are visible in the manifest.
[ ] Required context cannot be displaced by RAG/history overflow.
```

### Research tests, if implemented

Cases:

```txt
[ ] Research runs only when policy/profile allows it.
[ ] Research output becomes context candidates.
[ ] Research sources appear in manifest.
[ ] Research failure behavior is explicit.
```

## Harness expectations

Widget harness should prove user-visible behavior, but deterministic service tests should prove exact context admission.

Suggested harness smoke:

```txt
1. Run configured service with real model and durable persistence.
2. Send first message that establishes a conversation fact.
3. Send follow-up question in same conversation.
4. Verify model can answer based on prior turn.
5. Restart service or fresh composition.
6. Verify history endpoint still returns persisted messages.
```

Do not make the only proof depend on model wording. The deterministic proof should inspect the runtime request/context manifest.

## Acceptance criteria

```txt
[ ] A test fails if default production config silently uses no-op memory.
[ ] A test fails if enabled RAG has no retrieval source.
[ ] A test fails if enabled research has no concrete agent.
[ ] A test proves history is included in a follow-up turn.
[ ] A test proves memory recall/write survives through configured persistence.
[ ] Harness smoke proves normal chat continuity.
```
