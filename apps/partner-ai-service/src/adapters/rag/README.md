# RAG Adapters

Read this when: adding retrieval from host-owned knowledge sources.
Source of truth for: service-owned `RagRetrieverPort` implementations.
Not source of truth for: model-callable search tools.

RAG retrievers run during context preparation with policy-selected source ids.
Returned candidates must preserve provenance, trust, redaction class, and token
estimates so the context manifest can explain what reached the model.
