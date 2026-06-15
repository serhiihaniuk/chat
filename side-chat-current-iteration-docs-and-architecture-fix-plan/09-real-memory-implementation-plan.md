# Real Memory Implementation Plan

## 1. Goal

Replace the default no-op memory path with a concrete, policy-scoped
`MemoryPort` implementation that can recall durable memory before the model call
and record memory write candidates after a successful assistant turn.

This plan covers audit gap `4.1`.

## 2. Current gap

The default service composition falls back to:

```txt
apps/partner-ai-service/src/adapters/memory/noop-memory-port.ts
```

That adapter returns no recalled memories, proposes no write candidates, and
writes nothing. Existing tests prove the seam can carry fake memory data, but
they do not prove durable memory works in the launched app.

## 3. Ownership

| Concern                           | Owner                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| Memory policy decision            | `packages/partner-ai-core`                                                         |
| Memory recall/write port contract | `packages/partner-ai-core/src/ports/context/memory-port.ts`                        |
| Concrete memory adapter           | `apps/partner-ai-service/src/adapters/memory/**`                                   |
| Memory persistence model          | `packages/db` or an explicitly configured external store                           |
| Service wiring/config             | `apps/partner-ai-service/src/composition` and `apps/partner-ai-service/src/config` |

Do not put memory extraction, persistence, or DB rows in `agent-runtime`,
`chat-protocol`, `chat-client`, or the widget.

## 4. Design decisions to make first

```txt
[ ] Initial backing store: Postgres table, existing repository contract, or external memory service.
[ ] Memory scope model: workspace, subject, conversation, project, or a deliberately supported subset.
[ ] Write strategy: deterministic rule-based extractor first, model-assisted extractor, or deferred manual approval.
[ ] Dedupe/update strategy: append-only, replace by normalized key, or merge by confidence.
[ ] Approval model: auto-write under read_write policy, record candidates for later approval, or both by profile.
```

Prefer the smallest real implementation that proves the lifecycle end to end.
Avoid making memory depend on conversation history replay; memory is durable
knowledge, not transcript continuity.

## 5. Implementation sequence

1. Define the memory storage contract.

   Add repository methods or an external adapter interface for:

   ```txt
   recall memories by authorized scope and query
   record proposed write candidates
   write accepted candidates
   update or suppress duplicates
   record provenance and source turn ids
   ```

2. Add the concrete service memory adapter.

   Place it under:

   ```txt
   apps/partner-ai-service/src/adapters/memory/
   ```

   The adapter should implement `MemoryPort` without importing Hono, React,
   provider DTOs, or protocol event shapes.

3. Keep memory policy in core.

   Reuse the existing policy helpers around:

   ```txt
   packages/partner-ai-core/src/application/stream-chat/memory/
   ```

   The adapter should receive an already authorized, policy-scoped input. It
   should not decide whether memory is enabled for the turn.

4. Wire adapter selection through service composition.

   Connect the concrete adapter only when service config explicitly enables it.
   Production-like config must fail closed if memory is enabled but no backing
   store is configured.

5. Persist write candidates after successful assistant output.

   Keep this in the terminal finalization path. Memory write failures remain
   observable side effects and must not create a second terminal protocol event.

6. Add status reporting.

   Health or diagnostics should expose whether memory is `disabled`, `noop`, or
   `configured`, without leaking secrets, table names that reveal customer data,
   or raw memory content.

## 6. Data shape requirements

Each recalled `MemoryRecord` must carry enough metadata for context admission and
debugging:

```txt
memory id
scope
content
provenance/source turn id
confidence or trust signal if available
redaction class
estimated token count
created/updated timestamps
```

Each `MemoryWriteCandidate` must include:

```txt
candidate id
scope
proposed content
source assistant turn id
reason/provenance
policy mode that allowed the candidate
dedupe key or explicit no-dedupe decision
```

## 7. Tests

Add tests in the narrowest layer first:

```txt
packages/partner-ai-core/src/application/stream-chat/memory/**
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/composition/service-composition.test.ts
apps/partner-ai-service/src/inbound/http/app.persistence.test.ts
```

Required scenarios:

```txt
[ ] disabled policy does not call recall or write
[ ] read policy recalls but does not write
[ ] read_write policy recalls and records write candidates after success
[ ] write failures are observable and do not create a second terminal event
[ ] memory survives through configured persistence
[ ] production-like enabled memory cannot silently use the no-op adapter
```

## 8. Documentation updates

Update only docs that describe real behavior:

```txt
docs/architecture/extension-seams.md
docs/architecture/assistant-turn.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Docs must distinguish:

```txt
MemoryPort seam exists
memory adapter is configured
memory is enabled by policy for this turn
memory actually recalled or wrote data
```

## 9. Acceptance criteria

```txt
[ ] A first successful turn can produce memory write candidates.
[ ] Approved or auto-accepted candidates persist under an explicit scope.
[ ] A later turn recalls relevant memory through MemoryPort.
[ ] Recalled memory appears in the prepared context manifest.
[ ] Recalled memory appears in the runtime context board.
[ ] Disabled memory policy recalls and writes nothing.
[ ] Production-like enabled memory cannot fall back to no-op silently.
[ ] Memory write failures are observable without changing terminal event rules.
```
