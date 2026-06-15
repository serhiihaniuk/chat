# 06 — Real RAG Implementation

## Goal

Implement a concrete RAG retrieval path that can be enabled by config and admitted into model context.

The audit says the core has a `RagRetrieverPort`, but the default running service falls back to `noop-rag-retriever`, so no documents, embeddings, external search index, or knowledge source are queried.

## Default design rule

RAG should be pre-model prepared context by default.

Do not solve default RAG as a model-callable tool. A `search_documents` tool can exist later for iterative model-controlled search, but enterprise RAG should first be policy-controlled, authorized, and visible in the context manifest.

## Retrieval source registration

Add explicit source registration in the service capability manifest.

Suggested source shape:

```ts
export type RetrievalSourceManifest = {
  readonly sourceId: string;
  readonly displayName: string;
  readonly description: string;
  readonly adapterId: string;
  readonly defaultEnabled: boolean;
  readonly trustLevel: "host" | "retrieved" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
};
```

Profiles/policies should select allowed source IDs.

## RAG input/output contract

Suggested input:

```ts
export type RagRetrievalInput = {
  readonly requestId: string;
  readonly authContext: AuthContext;
  readonly workspace: WorkspaceRef;
  readonly userMessage: string;
  readonly hostContext: JsonObject | undefined;
  readonly allowedSourceIds: readonly string[];
  readonly maxCandidates: number;
  readonly abortSignal?: AbortSignal;
};
```

Suggested candidate:

```ts
export type RagContextCandidate = {
  readonly candidateId: string;
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly url?: string;
  readonly score: number;
  readonly estimatedTokens: number;
  readonly trustLevel: "retrieved" | "host" | "external";
  readonly redactionClass: "public" | "internal" | "confidential";
  readonly provenance: JsonObject;
};
```

Align with existing port names/types. Do not duplicate if equivalent types already exist.

## Initial concrete adapter choice

Pick one concrete adapter for the default app path.

Recommended pragmatic sequence:

```txt
1. File/static source retriever for local/dev/adoption harness.
   Purpose: prove config, manifest, retrieval, provenance, context admission, and tests.
   It is a reference adapter, not a demo app and not the enterprise production retriever.

2. HTTP/external retriever adapter.
   Purpose: let adopting teams connect enterprise search/vector/RAG services.
```

Avoid implementing a full embedding pipeline unless that is the current product need. The important near-term gap is that the app has no concrete retrieval path at all.

## Implementation tasks

Target files:

```txt
apps/partner-ai-service/src/config/service-config.ts
apps/partner-ai-service/src/composition/manifest/service-capability-manifest.ts
apps/partner-ai-service/src/composition/service-composition.ts
apps/partner-ai-service/src/adapters/rag/**
apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.ts
```

Tasks:

```txt
[ ] Add RAG source config fields.
[ ] Add source registration to service capability manifest.
[ ] Enforce allowedSourceIds from turn policy.
[ ] Implement at least one non-noop retriever adapter.
[ ] Pass auth/workspace/request/host context into the retriever.
[ ] Map retrieved results into context candidates with provenance/trust/redaction/token metadata.
[ ] Add failure mode config: degrade vs fail_turn.
[ ] Add tests for enabled, disabled, empty, unauthorized source, and failure behavior.
```

## Authorization rules

```txt
[ ] Retriever receives only allowed source IDs.
[ ] Retriever receives auth/workspace scope and must not search outside it.
[ ] If requested/manifest source is not allowed by policy, it is ignored or rejected by explicit policy.
[ ] Retrieved candidates carry sourceId and provenance so output can be audited.
```

## Failure behavior

Make this explicit per profile/config.

```txt
degrade
  Log/observe retrieval failure, continue without RAG context.

fail_turn
  Fail before model execution with explicit safe error.
```

Do not let adapter exceptions become untyped stream behavior.

## Tests to add

```txt
[ ] Manifest declares at least one retrieval source when RAG is enabled.
[ ] Turn policy passes allowedSourceIds into retrieval.
[ ] Disabled retrieval policy does not call the retriever.
[ ] Enabled retriever receives auth/workspace/request scope.
[ ] Retrieved candidates include provenance, trust, redaction class, and token estimate.
[ ] Retrieved candidates appear in the context manifest.
[ ] Retrieved sections appear in the runtime context board.
[ ] Retrieval failure behavior is explicit and tested for degrade/fail_turn.
```

## Acceptance criteria

```txt
[ ] RAG can be enabled by config.
[ ] Enabled RAG retrieves from at least one concrete source.
[ ] Turn policy controls allowed source IDs.
[ ] Retrieved candidates enter context admission, not runtime/provider directly.
[ ] Runtime receives prepared RAG context, not retriever DTOs.
[ ] Docs state which adapter is reference/local and which is production/external.
```
