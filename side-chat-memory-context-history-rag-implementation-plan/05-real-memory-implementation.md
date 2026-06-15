# 05 — Real Memory Implementation

## Goal

Implement durable memory recall and write behavior through a concrete adapter.

The audit says the core has a `MemoryPort`, but the default running service falls back to `noop-memory-port`, so recall returns `[]`, write candidate proposal returns `[]`, and writes do nothing. The result is that no durable user/workspace/conversation knowledge is recalled or saved.

## Do not confuse memory with history

```txt
History = prior turns in one conversation.
Memory = durable extracted facts/preferences/summaries scoped to user, workspace, or conversation.
```

Memory extraction is lossy. Chat continuity must work through history even if memory is disabled.

## Memory scope model

Suggested scopes:

```txt
conversation
  Knowledge useful only inside one conversation.

workspace
  Knowledge useful across conversations inside one workspace/project.

user
  User preferences/facts that can follow the user across workspaces only if policy allows.
```

Each memory record must have explicit scope. No global memory by accident.

## Suggested memory record shape

```ts
export type MemoryRecord = {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly kind: "fact" | "preference" | "summary" | "instruction";
  readonly content: string;
  readonly confidence: number;
  readonly status: "active" | "superseded" | "deleted";
  readonly sourceConversationId?: string;
  readonly sourceMessageIds?: readonly string[];
  readonly provenance?: JsonObject;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type MemoryScope =
  | { readonly kind: "conversation"; readonly conversationId: string }
  | { readonly kind: "workspace"; readonly workspaceId: string }
  | { readonly kind: "user"; readonly userId: string };
```

Use existing ID/time/json primitives where possible.

## Suggested memory candidate shape

```ts
export type MemoryWriteCandidate = {
  readonly candidateId: string;
  readonly action: "create" | "update" | "delete";
  readonly scope: MemoryScope;
  readonly kind: MemoryRecord["kind"];
  readonly content: string;
  readonly confidence: number;
  readonly reason: string;
  readonly sourceConversationId: string;
  readonly sourceMessageIds: readonly string[];
  readonly status: "proposed" | "approved" | "rejected" | "applied";
};
```

If there is no approval UI yet, make auto-apply an explicit config/policy mode. Do not silently auto-write in all modes.

## Implementation layers

### 1. Repository/storage layer

Target files:

```txt
packages/db/src/schema-contract/repositories.ts
packages/db/src/repositories/memory/**
packages/db/src/repositories/postgres-drizzle/**
```

Tasks:

```txt
[ ] Add memory record storage contract.
[ ] Add memory write candidate storage if candidates are persisted separately.
[ ] Add Postgres schema/repository implementation.
[ ] Add in-memory repository implementation for tests/local.
[ ] Add query methods by scope, relevance input, status, and limits.
```

### 2. Adapter layer

Target files:

```txt
apps/partner-ai-service/src/adapters/memory/**
apps/partner-ai-service/src/composition/service-composition.ts
```

Tasks:

```txt
[ ] Implement a concrete MemoryPort backed by the repository.
[ ] Implement recall by explicit allowed scopes.
[ ] Implement proposeWriteCandidates.
[ ] Implement writeCandidates with dedupe/update behavior.
[ ] Return no-op only when config says memory is disabled/noop.
```

### 3. Core/context layer

Target files:

```txt
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
packages/partner-ai-core/src/application/stream-chat/protocol/protocol-terminal-lifecycle.ts
```

Tasks:

```txt
[ ] Recall allowed memory during context preparation.
[ ] Convert recalled memory into context candidates.
[ ] Include memory candidates through context admission.
[ ] Record memory provenance in context manifest.
[ ] After successful answer, propose write candidates from final turn data.
[ ] Apply or persist candidates according to memory policy.
[ ] Observe memory write failures without creating a second terminal stream event.
```

## Memory extraction strategy

Start simple and explicit.

Recommended v1 options:

```txt
Mode: disabled
  No recall, no propose, no write.

Mode: propose_only
  Extract candidates and persist them as proposed; not recalled until approved/applied.

Mode: auto_apply
  Extract and write active memory immediately. Allowed only in explicit local/dev or accepted product mode.
```

Extraction can be:

```txt
Deterministic test extractor
  Used in tests to prove write/read lifecycle.

LLM-based extractor
  Optional adapter that reads final answer/transcript and proposes candidates.

Host-provided extractor
  Enterprise app provides memory candidates from its own logic.
```

Do not hide the extractor inside a broad `MemoryPort` if it becomes complex. If needed, introduce `MemoryExtractorPort`, but only if it reduces concept load.

## Dedupe/update rules

V1 can be simple:

```txt
same scope + same kind + normalized content => update timestamp/confidence/provenance
new content => create new active record
explicit delete candidate => mark deleted/superseded, do not hard-delete by default
```

If semantic dedupe is not implemented, say so explicitly in status/docs.

## Tests to add

```txt
[ ] Memory disabled: no recall, no propose, no write.
[ ] Memory enabled: first turn produces write candidates.
[ ] Auto-apply mode persists candidates.
[ ] Later turn recalls relevant active memory.
[ ] Recalled memory appears in context manifest.
[ ] Recalled memory appears in runtime context board.
[ ] Memory respects user/workspace/conversation scope.
[ ] Memory write failure is observable and does not create a second terminal event.
[ ] Memory persists across service restart when Postgres is enabled.
```

## Acceptance criteria

```txt
[ ] A first turn can produce memory write candidates.
[ ] Approved/applied candidates are persisted under explicit scope.
[ ] A later turn recalls relevant memory through MemoryPort.
[ ] Recalled memory appears in the prepared context manifest.
[ ] Recalled memory appears in the runtime context board.
[ ] Disabled memory policy recalls and writes nothing.
[ ] Memory write failures are observable and do not create a second terminal event.
```
