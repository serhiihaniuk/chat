# Capability Status And Docs Sync Plan

## 1. Goal

Keep docs, service status, and current-iteration acceptance criteria honest as
memory, RAG, research, history context, context admission, and Postgres
persistence move from seams to concrete behavior.

This plan covers audit gap `4.9`.

## 2. Current gap

Canonical docs describe the intended architecture, while implementation still
contains no-op adapters and seam tests. That is useful architecture direction,
but it can overpromise app behavior if docs do not state what is concrete.

The status model should distinguish:

```txt
seam exists
capability is configured
policy enabled it for a turn
capability produced context or persisted data
```

## 3. Ownership

| Concern                    | Owner                                                           |
| -------------------------- | --------------------------------------------------------------- |
| Canonical lifecycle        | `docs/architecture/assistant-turn.md`                           |
| Extension seams            | `docs/architecture/extension-seams.md`                          |
| Product requirements       | `docs/product/requirements.md`                                  |
| Verification commands      | `docs/operations/verification.md`                               |
| Service defaults           | `apps/partner-ai-service/README.md`                             |
| Adapter placement          | `apps/partner-ai-service/src/adapters/README.md`                |
| Current iteration tracking | `side-chat-current-iteration-docs-and-architecture-fix-plan/**` |

Package READMEs remain local orientation cards. They should link canonical docs
rather than redefine global vocabulary.

## 4. Documentation rules

Use capability status words consistently:

```txt
disabled: config or policy prevents use
noop: adapter is intentionally empty and visible as such
configured: concrete adapter/source is wired
active: policy selected the capability for this turn
produced: capability returned context, artifact, memory, or persistence output
```

Avoid claims like "Side Chat has memory" unless the doc says whether that means
the seam, a configured adapter, or turn-level behavior.

## 5. Implementation sequence

1. Add capability status to service diagnostics or health.

   Include memory, RAG, research, history context, context admission policy, and
   persistence backend status. Do not leak secrets or private content.

2. Update service README defaults.

   State which capabilities are disabled/no-op by default and how to enable a
   concrete adapter.

3. Add default behavior notes to extension docs.

   `docs/architecture/extension-seams.md` should identify where to implement a
   capability and whether the default app currently ships a concrete adapter.

4. Keep assistant-turn docs architectural.

   `docs/architecture/assistant-turn.md` can describe lifecycle slots, but
   should not imply every slot has a production-ready implementation.

5. Update current iteration acceptance as gaps close.

   Check boxes only when implementation and tests prove behavior. Do not close a
   capability because a port exists.

6. Delete or rewrite stale planning notes when they become misleading.

   This repo is pre-production. Prefer final clear docs over compatibility notes
   for old internal shapes.

## 6. Tests and checks

Docs/status work should include:

```txt
[ ] health/diagnostics test for capability status shape
[ ] config/composition tests for disabled/noop/configured states
[ ] custom docs/readability checks if docs grow or terms change
[ ] link/path check by static inspection when docs move
```

Verification commands:

```txt
npm run lint:oxlint
npm run typecheck
npm run lint:custom
npm run verify, before closing the full iteration
```

For docs-only patches, at minimum run the custom/readability checks available in
the repo and report if broader gates were not run.

## 7. Documentation updates

Expected touched files over the full capability implementation:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
docs/product/requirements.md
docs/operations/verification.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Do not add a second global vocabulary source. If new terms are needed, add them
to `docs/domain/vocabulary.md`.

## 8. Acceptance criteria

```txt
[ ] Docs state which capabilities are concrete and which are extension seams.
[ ] Extension seam docs include default app behavior notes.
[ ] Service README lists enabled default capabilities.
[ ] Health or diagnostics expose capability status safely.
[ ] Current iteration acceptance criteria are updated or closed when complete.
[ ] No docs imply memory/RAG/research are production-ready before app-path tests prove it.
```
