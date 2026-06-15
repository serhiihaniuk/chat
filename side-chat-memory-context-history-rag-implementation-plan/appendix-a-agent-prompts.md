# Appendix A — Agent Prompts

Use these as focused prompts for worker agents.

## Phase 1 prompt — status/config

```md
Use `00-orchestrator-brief.md` and `01-capability-status-and-config-foundation.md`.

Implement explicit capability status and config foundation for memory, RAG, research, history, and context admission.

Do not implement memory/RAG/research behavior yet.
Do not hide no-op fallbacks.
Production-like config must fail if an enabled capability has no concrete adapter.
Add diagnostics without leaking secrets.
Update docs minimally with honest status.
```

## Phase 2 prompt — history

```md
Use `00-orchestrator-brief.md` and `02-conversation-history-in-model-context.md`.

Implement conversation history admission into model context.
Choose recent prior messages as runtime messages for MVP.
Do not solve chat continuity through memory.
Do not include the current user message twice.
Add reset and second-turn tests.
Expose history admission in context manifest or runtime request inspection.
```

## Phase 3 prompt — Postgres

```md
Use `00-orchestrator-brief.md` and `03-durable-postgres-persistence-path.md`.

Fix the Postgres-backed persistence path for the real service.
Do not fall back to in-memory repositories when SIDECHAT_DATABASE_URL is configured.
Prove persisted history survives fresh service composition/restart.
Do not implement memory/RAG in this phase.
```

## Phase 4 prompt — context admission

```md
Use `00-orchestrator-brief.md` and `04-context-admission-and-budgeting.md`.

Replace simple include-all context selection with deterministic_v1 admission.
Move token budget out of hidden constants.
Record included and dropped candidates in manifest.
Keep the algorithm boring and locally readable.
```

## Phase 5 prompt — memory

```md
Use `00-orchestrator-brief.md` and `05-real-memory-implementation.md`.

Implement concrete memory recall/write through configured service path.
Keep history separate from memory.
Memory records must have explicit scope.
Disabled memory must recall/write nothing.
Memory write failures must be observable without creating duplicate terminal stream events.
```

## Phase 6 prompt — RAG

```md
Use `00-orchestrator-brief.md` and `06-real-rag-implementation.md`.

Implement a concrete RAG retriever path enabled by config.
Do not implement default RAG as a model-callable tool.
Register retrieval sources in the service manifest.
Pass auth/workspace/allowedSourceIds into retrieval.
Retrieved context must enter context admission before runtime.
```

## Phase 7 prompt — research

```md
Use `00-orchestrator-brief.md` and `07-research-agent-implementation.md`.

First decide if research is currently needed.
If not needed, keep it disabled/noop explicitly and update status/docs/tests.
If needed, implement ResearchAgentPort as a context producer, not browser protocol output.
Research must run only when policy/profile allows it.
```

## Phase 8 prompt — tests

```md
Use `00-orchestrator-brief.md` and `08-app-path-tests-and-harnesses.md`.

Add app-path tests that prove default/configured service behavior.
Do not rely only on fake-injected seam tests.
Tests should inspect runtime request/context manifest where possible instead of relying only on model wording.
```

## Phase 9 prompt — docs

```md
Use `00-orchestrator-brief.md` and `09-documentation-and-status-sync.md`.

Update docs to match implemented behavior.
Do not add wall-of-text docs.
Add concise status tables and verification notes.
Clearly distinguish implemented capability from extension seam.
```
