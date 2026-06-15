# 00 — Orchestrator Brief

## Purpose

This plan implements the missing pieces from the current Memory / Context / History / RAG gap audit.

The current state is not a broken architecture. The audit says the repo already has extension seams for memory, RAG, research, context boards, history persistence, and memory-write lifecycle hooks. The gap is that the default running app does not yet have concrete memory, concrete RAG, concrete research, or prior conversation history admitted back into model context.

This plan converts those gaps into implementation phases.

## Non-negotiable rules

1. Do not treat a seam as an implemented feature.
2. Do not hide no-op adapters in production-like config.
3. Do not solve conversation continuity through memory extraction.
4. Do not solve default RAG as a model-callable tool.
5. Do not let memory, RAG, DB, provider, or research internals leak into the widget.
6. Do not let browser protocol types become generic runtime/DB/shared primitives.
7. Keep the human-readability gate active: named stages, short helpers, local source/target comments, no clever expression chains.
8. The repo is early-stage. Prefer final-state implementation over compatibility shims.

## Canonical distinctions

```txt
History
  Prior turns in one conversation. Needed for normal chat continuity.

Memory
  Durable extracted knowledge, scoped to user/workspace/conversation.
  It is lossy by design and must not replace history.

RAG
  Authorized external/indexed knowledge retrieved before model execution.
  It belongs in prepared context by default, not as a model-called tool.

Research
  Optional pre-answer synthesis/gathering. More workflow-like than basic RAG.
  It should be added only when there is a real product need.

Context admission
  The policy that decides which history/memory/RAG/research/host context fits
  into the model input budget and why other candidates were dropped.
```

## Recommended implementation sequence

```txt
Phase 1: Capability status and config foundation
Phase 2: Conversation history in model context
Phase 3: Durable Postgres persistence path
Phase 4: Context admission and budgeting
Phase 5: Real memory implementation
Phase 6: Real RAG implementation
Phase 7: Research agent implementation, only if needed now
Phase 8: App-path tests and harnesses
Phase 9: Documentation and status sync
Phase 10: Final definition of done review
```

The phases can be split into smaller PRs, but the order should not be changed casually. In particular, do not build memory and RAG on top of silent no-op configuration, and do not claim memory/RAG/research are implemented before the default app can enable concrete adapters.

## Current high-level gap list

```txt
[ ] Default service status does not clearly expose no-op/disabled capabilities.
[ ] Service config cannot enable concrete memory/RAG/research/history budgets.
[ ] Conversation history is persisted/fetchable but not admitted to model context.
[ ] Postgres local path needs durable verification/fix.
[ ] Memory uses a no-op adapter by default.
[ ] RAG uses a no-op retriever by default.
[ ] Research uses a no-op agent by default.
[ ] Context admission is simple include-all, with hard-coded budget values.
[ ] Tests prove seams with fakes more than default app behavior.
[ ] Docs can still overstate intended architecture as implemented behavior.
```

## Definition of a useful implementation patch

Every worker patch should report:

```txt
1. Which missing capability was implemented or explicitly marked disabled.
2. Which files changed.
3. Which config keys or policies were added.
4. Which context manifest/runtime request fields prove the behavior.
5. Which app-path tests were added or updated.
6. Which docs/status notes were updated.
7. Any remaining explicit limitation.
```

## Scope reminders

Likely implementation files:

```txt
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-selection.ts
apps/partner-ai-service/src/composition/context-manager/rendering/runtime-message-rendering.ts
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/adapters/rag/**
apps/partner-ai-service/src/adapters/agents/**
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/postgres-drizzle/**
packages/db/src/repositories/memory/**
```

Likely tests:

```txt
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
apps/partner-ai-service/src/config/service-config.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
test-harness/widget-harness/e2e/persistent.spec.ts
test-harness/widget-harness/e2e/widget-harness.spec.ts
```

Likely docs:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
packages/partner-ai-core/src/application/stream-chat/README.md
```
