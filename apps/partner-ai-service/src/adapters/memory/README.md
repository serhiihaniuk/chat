# Memory Adapters

Read this when: adding durable memory recall or write-candidate storage.
Source of truth for: service-owned `MemoryPort` implementations.
Not source of truth for: RAG retrieval or repository schema.

Memory recall runs during context preparation under `MemoryPolicy`; write
candidates run after successful turns. Raw model output should not be persisted
as memory without the memory policy path.
