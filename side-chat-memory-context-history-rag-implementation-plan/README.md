# Side Chat Memory / Context / History / RAG Implementation Plan

This package turns the current gap audit into an implementation plan for the missing runtime behavior.

It is not a replacement for the readability plan already being implemented. Keep the readability gate active while implementing these phases. The goal is not only to add features, but to add them in a way that remains readable, locally understandable, and honest in docs/status.

## How to use this package

Give the orchestrator:

```txt
00-orchestrator-brief.md
10-final-definition-of-done.md
```

Give a worker agent:

```txt
00-orchestrator-brief.md
one phase file only
relevant repo files
```

Use `ALL-IN-ONE-memory-context-history-rag-plan.md` only when the orchestrator needs full context. Do not feed the all-in-one plan to every worker unless needed.

## Files

```txt
00-orchestrator-brief.md
01-capability-status-and-config-foundation.md
02-conversation-history-in-model-context.md
03-durable-postgres-persistence-path.md
04-context-admission-and-budgeting.md
05-real-memory-implementation.md
06-real-rag-implementation.md
07-research-agent-implementation.md
08-app-path-tests-and-harnesses.md
09-documentation-and-status-sync.md
10-final-definition-of-done.md
appendix-a-agent-prompts.md
appendix-b-suggested-types-and-config.md
ALL-IN-ONE-memory-context-history-rag-plan.md
```
