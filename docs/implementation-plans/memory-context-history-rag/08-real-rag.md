# 8. Real RAG

## Goal

Add a concrete `RagRetrieverPort` path so configured deployments can retrieve
authorized knowledge before the model call and admit retrieved candidates into
prepared context with provenance.

## Why Eighth

RAG needs explicit sources, config, app-path tests, and budgeted context
admission so retrieved content does not become unbounded prompt stuffing.

## Ownership

| Concern                       | Owner                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| Retrieval source declarations | host capability manifest through service composition          |
| Allowed source selection      | `packages/partner-ai-core` turn policy                        |
| Retriever contract            | `packages/partner-ai-core/src/ports/context/rag-retriever.ts` |
| Retriever implementation      | `apps/partner-ai-service/src/adapters/rag/**`                 |
| Context candidate rendering   | `apps/partner-ai-service/src/composition/context-manager/**`  |

RAG is pre-model prepared context. Do not make the first RAG implementation a
model-callable runtime tool.

## Retrieval Source Registration

Portable manifest declaration shape:

```ts
export type RetrievalSourceCapability = {
  readonly sourceId: string;
  readonly description: string;
  readonly trustLevel: ContextTrustLevel;
};
```

Profiles and policies should select allowed source ids. Adapter ids, HTTP URLs,
static-file paths, credentials, default enablement, and service-only source
defaults stay in `apps/partner-ai-service` config/adapters and must not become
portable manifest fields.

Retrieved candidates carry per-result provenance, redaction class, score, URL,
and token estimate after the selected service adapter runs.

## Initial Backend Decision

Recommended sequence:

```txt
1. Static or file-backed reference retriever for local/adoption harness.
2. HTTP or external retriever adapter for enterprise search/vector services.
```

Avoid implementing a full embedding pipeline unless that is the current product
need. The near-term gap is that the app has no concrete retrieval path at all.

## Implementation Steps

1. Model configured retrieval source ids in service config and portable manifest
   declarations without adapter ids or credentials.
2. Implement at least one non-noop retriever under
   `apps/partner-ai-service/src/adapters/rag/`.
3. Pass only policy-allowed source ids into retrieval.
4. Pass auth, workspace, request, and host context scope into the retriever.
5. Map retrieved records into context candidates with provenance, trust,
   redaction, and token metadata.
6. Admit retrieved candidates through phase 6 context admission.
7. Render safe provenance into the context manifest.
8. Implement explicit retrieval failure behavior: `degrade` or `fail_turn`.

## Candidate Requirements

Each candidate should include:

```txt
candidate id
source id
title or location
content excerpt
URL if safe and available
provenance or citation data
score or ranking signal
trust level
redaction class
estimated token count
safe metadata
```

Do not expose raw search responses, embeddings, DB rows, or internal document
ACLs past the service/core boundary.

## Tests

```txt
[ ] enabled RAG declares at least one retrieval source
[ ] disabled retrieval does not call RagRetrieverPort
[ ] retriever receives workspace, auth, request scope, and allowed source ids
[ ] unauthorized source ids are not passed to retriever
[ ] retrieved candidates appear in context manifest
[ ] retrieved candidates render into runtime context board
[ ] empty retrieval is valid
[ ] retrieval failure follows configured degrade/fail_turn policy
```

## Exit Criteria

```txt
[ ] RAG can be enabled by config.
[ ] A configured service can retrieve from at least one concrete source.
[ ] Turn policy controls allowed source ids.
[ ] Retrieved candidates include provenance, trust, redaction class, and token estimate.
[ ] Runtime receives prepared retrieved context, not retriever internals.
[ ] Disabled retrieval policy does not call the retriever.
```
