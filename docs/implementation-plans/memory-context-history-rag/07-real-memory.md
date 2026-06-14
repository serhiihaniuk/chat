# 7. Real Memory

## Goal

Replace default no-op memory with a concrete, policy-scoped `MemoryPort`
implementation for durable recall and post-turn write candidates.

## Why Seventh

Memory needs explicit status, configuration, app-path tests, conversation
continuity, verified persistence, and budgeted context admission. Earlier phases
provide those guardrails.

## Ownership

| Concern                 | Owner                                                       |
| ----------------------- | ----------------------------------------------------------- |
| Memory policy           | `packages/partner-ai-core`                                  |
| Memory port contract    | `packages/partner-ai-core/src/ports/context/memory-port.ts` |
| Concrete memory adapter | `apps/partner-ai-service/src/adapters/memory/**`            |
| Memory persistence      | `packages/db` or a configured external store                |
| Service wiring          | `apps/partner-ai-service/src/composition` and config        |

Do not put memory extraction or memory storage in runtime, protocol, client, or
widget packages.

## Design Decisions

Decide before implementation:

```txt
[ ] backing store: Postgres table, existing repository, or external memory service
[ ] supported scope: workspace, subject, conversation, project, or explicit subset
[ ] write strategy: deterministic extractor, model-assisted extractor, or approval queue
[ ] dedupe strategy: append-only, replace by key, or merge by confidence
[ ] approval behavior: auto-write under read_write policy or candidate review
```

## Memory Scope Model

Suggested scopes:

```txt
conversation: knowledge useful only inside one conversation
workspace: knowledge useful across conversations inside one workspace/project
user: user preferences/facts that follow the user only when policy allows
```

Each memory record must have explicit scope. No global memory by accident.

## Memory Field Ownership

Core port fields should be the model-context contract: ids, scope, content,
confidence, updated time, safe provenance, redaction/trust metadata when needed
for admission, and token estimates when the adapter can provide them.

DB metadata should own storage lifecycle details: active/superseded/deleted
status, approval status, dedupe keys, source table ids, migration-only fields,
and adapter-specific indexing data. Service adapters must filter or map those
storage details before returning `MemoryRecord` values to core.

## Data Requirements

Recalled memories returned through `MemoryPort` should include:

```txt
memory id
scope
kind: fact, preference, summary, or instruction
content
source turn or provenance
trust/confidence signal if available
redaction class
estimated tokens
updated timestamp
```

Write candidates returned through `MemoryPort` should include:

```txt
candidate id
action: create, update, or delete
scope
kind
proposed content
source assistant turn id
source message ids
reason or provenance
```

The database record may add proposed/approved/rejected/applied status and
dedupe metadata after the port candidate is adapted into storage.

## Implementation Steps

1. Define memory storage/repository methods.
2. Implement a concrete service memory adapter.
3. Keep policy checks in core memory helpers.
4. Wire adapter selection through phase 2 config.
5. Recall allowed memory during context preparation.
6. Convert recalled memory into context candidates admitted by phase 6.
7. Persist write candidates after successful assistant output.
8. Report memory adapter and policy status through phase 1 diagnostics.

## Memory Write Modes

```txt
disabled: no recall, no propose, no write
propose_only: extract candidates and persist as proposed
auto_apply: extract and write active memory immediately under explicit policy
```

V1 dedupe can be simple:

```txt
same scope + same kind + normalized content => update timestamp/confidence/provenance
new content => create new active record
delete candidate => mark deleted or superseded
```

## Tests

```txt
[ ] disabled policy does not recall or write
[ ] read policy recalls but does not write
[ ] read_write policy recalls and records write candidates after success
[ ] auto-apply mode persists candidates when explicitly configured
[ ] later turn recalls relevant active memory
[ ] memory respects user/workspace/conversation scope
[ ] write failures are observable and do not create a second terminal event
[ ] memory survives through configured persistence
[ ] production-like enabled memory cannot silently use no-op
```

## Exit Criteria

```txt
[ ] A successful turn can produce memory write candidates.
[ ] Approved or auto-accepted candidates persist under explicit scope.
[ ] Later turns recall relevant memory through MemoryPort.
[ ] Recalled memory appears in prepared context and runtime context board.
[ ] Disabled memory policy recalls and writes nothing.
```
