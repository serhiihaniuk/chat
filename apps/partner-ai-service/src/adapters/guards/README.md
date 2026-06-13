# Turn Guard Adapters

Read this when: adding prompt/security checks before private context exposure.
Source of truth for: service-owned `TurnGuardRegistryPort` implementations.
Not source of truth for: product policy or context preparation.

Turn guards receive minimal request/profile input and return allow, warn, or
block decisions before conversation persistence, RAG, memory, research, or
runtime execution.
