# Side Chat Current Iteration Fix Plan

This package is the replacement for the previous current-result plan. The previous plan over-focused on documentation cleanup. This version treats the current iteration as one combined effort:

```txt
compress and simplify documentation
+ finish the architecture rewrite
+ preserve the human-readability quality gate
```

Use this package with the active readability implementation. Do not restart the previous work. Assume tests, lint, typecheck, and custom static checks pass unless an implementation task explicitly asks to run them.

## Suggested usage

For the orchestrator, provide:

```txt
00-orchestrator-brief.md
01-current-state-review.md
07-acceptance-criteria.md
```

For worker agents, provide:

```txt
00-orchestrator-brief.md
one phase file only
relevant repo files
```

The all-in-one file is for the human owner or the orchestrator when full context is needed. Do not feed it to every implementation agent by default.

For the memory/context/history/RAG gap audit, provide:

```txt
08-memory-context-history-rag-gap-audit.md
one 09-17 gap plan only
relevant canonical docs from docs/README.md
```

## Package contents

```txt
00-orchestrator-brief.md
01-current-state-review.md
02-documentation-compression-plan.md
03-architecture-ownership-and-boundaries-plan.md
04-extension-seams-plan.md
05-core-runtime-context-protocol-plan.md
06-service-widget-testing-governance-plan.md
07-acceptance-criteria.md
08-memory-context-history-rag-gap-audit.md
09-real-memory-implementation-plan.md
10-real-rag-implementation-plan.md
11-real-research-agent-implementation-plan.md
12-conversation-history-context-plan.md
13-budgeted-context-admission-plan.md
14-capability-configuration-plan.md
15-app-behavior-test-coverage-plan.md
16-postgres-persistence-path-plan.md
17-capability-status-docs-sync-plan.md
ALL-IN-ONE-current-iteration-fix-plan.md
```
