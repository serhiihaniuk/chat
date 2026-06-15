# 09 — Documentation and Status Sync

## Goal

Keep docs honest and compact while implementation catches up to architecture.

The audit says canonical docs describe intended architecture, while implementation is still partly ports, no-ops, and fake-injected tests. That mismatch is dangerous because it makes the repo look feature-complete when the default app behavior is not.

## Documentation rule

```txt
Do not write docs as if seams are features.
Do not add more large architecture text.
Compress docs and add concrete status notes.
```

The documentation reset/readability work is already in implementation. This phase only covers status alignment for memory/history/RAG/research/context.

## Required docs updates

Target docs:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
packages/partner-ai-core/src/application/stream-chat/README.md
```

## Add a capability status table

Add a concise table to the service README or extension seams doc:

```md
| Capability               | Default app status               | Concrete adapter                  | How to enable                     | Notes                 |
| ------------------------ | -------------------------------- | --------------------------------- | --------------------------------- | --------------------- |
| History API              | implemented                      | conversation repository           | enabled by persistence config     | fetch/reset history   |
| History in model context | implemented/disabled/in progress | context manager history admission | SIDECHAT_HISTORY_MODE             | recent messages first |
| Memory recall/write      | disabled/noop/implemented        | MemoryPort adapter                | SIDECHAT_MEMORY_MODE              | not same as history   |
| RAG                      | disabled/noop/implemented        | RagRetrieverPort adapter          | SIDECHAT_RAG_MODE                 | pre-model context     |
| Research                 | disabled/noop/implemented        | ResearchAgentPort adapter         | SIDECHAT_RESEARCH_MODE            | optional              |
| Context admission        | simple/deterministic_v1          | context manager                   | SIDECHAT_CONTEXT_ADMISSION_POLICY | include/drop manifest |
```

Keep this table updated as each phase lands.

## Update assistant turn doc

`docs/architecture/assistant-turn.md` should show the real current pipeline.

For example:

```txt
authorize
resolve profile/policy
run guards
persist user turn
gather history/memory/RAG/research sources according to policy
admit context under budget
execute runtime
finalize
record memory write candidates, if memory policy enables it
```

For each step, state whether it is currently implemented, disabled by default, or extension seam only.

## Update extension seams doc

For each seam:

```txt
MemoryPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove

RagRetrieverPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove

ResearchAgentPort
  Purpose
  Default adapter state
  Concrete adapters available
  Config key
  What tests prove
```

Do not duplicate full architecture. Link to vocabulary and assistant-turn docs if needed.

## Update verification docs

`docs/operations/verification.md` should include commands/checklists for:

```txt
[ ] checking capability diagnostics
[ ] running configured service with Postgres
[ ] proving history survives restart
[ ] proving follow-up turns include history
[ ] proving memory/RAG are enabled only when concrete adapters exist
```

Do not claim these pass until they do.

## Close or update working plan docs

If current-iteration plan docs are kept in repo, update unchecked criteria as work lands. If they are temporary agent artifacts, delete or archive them after they are converted into implementation/docs.

## Acceptance criteria

```txt
[ ] Docs state which capabilities are concrete and which are extension seams.
[ ] Extension seam docs include default app behavior notes.
[ ] Service README lists enabled default capabilities.
[ ] Verification docs include memory/history/RAG/research checks.
[ ] Docs do not overpromise production-ready memory/RAG/research before concrete adapters exist.
[ ] Current iteration acceptance criteria are updated, closed, or removed once superseded.
```
