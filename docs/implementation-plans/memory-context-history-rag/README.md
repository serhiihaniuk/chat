# Memory, Context, History, and RAG Implementation Plan

Read this when: you need the ordered implementation path for turning the
current memory, RAG, research, history, context admission, and persistence seams
into app behavior.
Source of truth for: implementation order for this plan set.
Not source of truth for: canonical vocabulary, lifecycle order, or package
boundaries.

## Why This Folder Exists

The architecture already has seams for memory, RAG, research, context boards,
history persistence, and memory-write lifecycle hooks. The running app still
needs concrete adapters, configuration, app-path tests, and honest status
reporting.

This folder is ordered by implementation dependency, not by audit section.

## Implementation Order

| Order | Plan                                      | Why now                                                                                    |
| ----: | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
|     1 | `01-capability-status-and-diagnostics.md` | Make current disabled/no-op behavior visible before adding more wiring.                    |
|     2 | `02-capability-configuration.md`          | Create the config path that later concrete adapters will use.                              |
|     3 | `03-app-behavior-test-coverage.md`        | Lock the distinction between seam tests and launched app behavior.                         |
|     4 | `04-conversation-history-context.md`      | Deliver ordinary chat continuity, the most visible missing behavior.                       |
|     5 | `05-postgres-persistence-path.md`         | Prove durable history before building durable memory on top of it.                         |
|     6 | `06-budgeted-context-admission.md`        | Replace include-all before memory/RAG introduce broader candidate volume.                  |
|     7 | `07-real-memory.md`                       | Add durable recall/write once policy, config, tests, persistence, and admission are ready. |
|     8 | `08-real-rag.md`                          | Add authorized retrieval once configuration and context admission are explicit.            |
|     9 | `09-research-agent.md`                    | Add research last, and only if product needs pre-answer synthesis beyond RAG.              |
|    10 | `10-final-definition-of-done.md`          | Use as the final acceptance gate after implemented phases land.                            |

## Non-Negotiable Rules

```txt
[ ] Do not treat a seam as an implemented feature.
[ ] Do not hide no-op adapters in production-like config.
[ ] Do not solve conversation continuity through memory extraction.
[ ] Do not solve default RAG as a model-callable tool.
[ ] Do not leak memory, RAG, DB, provider, or research internals into the widget.
[ ] Do not turn browser protocol types into generic runtime/DB/shared primitives.
[ ] Keep the human-readability gate active: named stages, short helpers, and boring code.
```

## Patch Report Contract

Each implementation patch should report:

```txt
1. Which missing capability was implemented or explicitly marked disabled.
2. Which files changed.
3. Which config keys or policies were added.
4. Which context manifest or runtime request fields prove the behavior.
5. Which app-path tests were added or updated.
6. Which docs or status notes were updated.
7. Any remaining explicit limitation.
```

## Reading Path

Before implementing any phase, read:

```txt
docs/README.md
docs/domain/vocabulary.md
docs/architecture/system-map.md
docs/architecture/package-boundaries.md
docs/architecture/assistant-turn.md
docs/architecture/extension-seams.md
docs/operations/verification.md
the phase file
the nearest package README for touched code
```

Read `docs/architecture/runtime-and-protocol-events.md` for runtime,
protocol, Effect, Stream, or event changes. Read
`docs/architecture/widget-and-host-integration.md` for widget-visible behavior.

## Stop Condition

This plan set is complete when:

```txt
[ ] Capability status reports disabled/no-op/configured states safely.
[ ] Config can enable memory, RAG, research, history, and context budgets deliberately.
[ ] Tests fail when production-like config silently uses no-op capabilities.
[ ] Follow-up turns can use prior conversation context under policy.
[ ] Postgres-backed history survives service restart.
[ ] Context admission can drop candidates under budget pressure and explain why.
[ ] Memory recall/write uses a concrete adapter and explicit scope.
[ ] RAG retrieves from at least one configured source with provenance.
[ ] Research is either implemented with tests or explicitly deferred as not needed now.
```
