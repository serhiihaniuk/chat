# Observability Adapters

Read this when: adding a concrete stream observability sink.
Source of truth for: service-owned `ObservabilitySinkPort` implementations.
Not source of truth for: runtime/provider-native event shapes.

Observability sinks receive already-redacted records from core. Keep raw prompts,
provider output, and tool inputs/results out of service logs unless a later
policy explicitly authorizes a narrower diagnostic path.
