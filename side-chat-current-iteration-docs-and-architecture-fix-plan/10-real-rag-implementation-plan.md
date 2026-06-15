# Real RAG Implementation Plan

## 1. Goal

Add a concrete `RagRetrieverPort` path so configured Side Chat deployments can
retrieve authorized knowledge before the model call and admit retrieved
candidates into prepared context with provenance.

This plan covers audit gap `4.2`.

## 2. Current gap

The default service composition falls back to:

```txt
apps/partner-ai-service/src/adapters/rag/noop-rag-retriever.ts
```

The no-op retriever returns no candidates. The architecture has the right seam,
but the launched service has no document store, search index, external
retriever, source registration, or app-path test proving retrieval.

## 3. Ownership

| Concern                       | Owner                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| Retrieval source declarations | host capability manifest through service composition          |
| Allowed source selection      | `packages/partner-ai-core` turn policy                        |
| Retriever contract            | `packages/partner-ai-core/src/ports/context/rag-retriever.ts` |
| Retriever implementation      | `apps/partner-ai-service/src/adapters/rag/**`                 |
| Context candidate rendering   | `apps/partner-ai-service/src/composition/context-manager/**`  |

RAG remains pre-model prepared context. Do not make the first RAG path a
model-callable runtime tool.

## 4. Initial retriever choice

Choose one backend for the first concrete implementation:

```txt
[ ] in-process fixture retriever for local/adoption testing only
[ ] Postgres-backed lexical or vector search
[ ] external enterprise search adapter
[ ] provider-hosted vector store adapter
```

For product credibility, the first app-path test can use an in-process concrete
retriever, but production-like config must identify the real backing service it
expects.

## 5. Implementation sequence

1. Model configured retrieval sources.

   Add config and manifest wiring for source ids, labels, trust class, and
   backend-specific connection names. Source ids are policy inputs, not arbitrary
   browser request values.

2. Implement the concrete retriever.

   Place implementation under:

   ```txt
   apps/partner-ai-service/src/adapters/rag/
   ```

   The adapter should receive the authorized retrieval input and return
   `RagContextCandidate[]` with source metadata already normalized.

3. Wire allowed source ids through policy.

   Confirm the turn policy passes only profile/manifest-allowed source ids into
   retrieval. Disabled retrieval should not call the adapter.

4. Map retrieved candidates into context candidates.

   Use:

   ```txt
   apps/partner-ai-service/src/composition/context-manager/candidates/context-candidate-creation.ts
   apps/partner-ai-service/src/composition/context-manager/sources/context-source-gathering.ts
   ```

5. Render provenance into the context manifest.

   The model can receive retrieved content, but browser-facing provenance must
   be protocol-safe and redacted.

6. Define failure policy.

   Decide whether retrieval failure:

   ```txt
   fails the turn before sidechat.started
   degrades to no retrieved context
   degrades only for optional sources
   ```

   Implement and test the chosen behavior explicitly.

## 6. Candidate requirements

Each retrieved candidate should include:

```txt
candidate id
source id
title or location
content excerpt
provenance or citation data
score or ranking signal
trust level
redaction class
estimated token count
metadata safe for internal context manifests
```

Do not expose raw provider search responses, embeddings, DB rows, or internal
document ACLs past the service/core boundary.

## 7. Tests

Required scenarios:

```txt
[ ] manifest declares retrieval source when RAG is enabled
[ ] disabled retrieval does not call RagRetrieverPort
[ ] retriever receives workspace/auth/request scope and allowedSourceIds
[ ] unauthorized source id is not passed to retriever
[ ] retrieved candidates appear in context manifest
[ ] retrieved candidates render into the runtime context board
[ ] empty retrieval is valid and visible in diagnostics/manifest
[ ] retrieval failure follows the chosen policy
[ ] enabled production-like RAG cannot have zero configured sources
```

Likely test files:

```txt
packages/partner-ai-core/src/application/stream-chat/rag/retrieve-allowed-rag-candidates.test.ts
apps/partner-ai-service/src/composition/context-manager/service-context-manager.test.ts
apps/partner-ai-service/src/composition/service-composition.test.ts
test-harness/adoption-harness/src/adoption-golden-path.test.ts
```

## 8. Documentation updates

Update:

```txt
docs/architecture/extension-seams.md
docs/product/requirements.md
apps/partner-ai-service/README.md
apps/partner-ai-service/src/adapters/README.md
side-chat-current-iteration-docs-and-architecture-fix-plan/07-acceptance-criteria.md
```

Docs must state which retrieval backend is concrete and which examples remain
fixtures.

## 9. Acceptance criteria

```txt
[ ] Manifest declares at least one retrieval source when RAG is enabled.
[ ] Turn policy passes allowedSourceIds into retrieval.
[ ] Retriever receives auth/workspace/request scope.
[ ] Retrieved candidates include provenance, trust, redaction class, and token estimate.
[ ] Retrieved candidates appear in the context manifest.
[ ] Retrieved sections appear in the runtime context board.
[ ] Disabled retrieval policy does not call the retriever.
[ ] Retrieval failure behavior is explicit and tested.
```
