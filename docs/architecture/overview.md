# Architecture Overview

Side Chat is an embeddable AI chat product without an owned host app. The production shape is a modular monolith:

- `apps/partner-ai-service` owns HTTP, service composition, runtime adapters, and deployment entrypoints.
- `packages/partner-ai-core` owns pure authority, policy, stream orchestration, ports, typed errors, and Effect service wiring.
- `packages/agent-runtime` owns AI SDK-backed model execution and provider translation.
- `packages/chat-protocol` owns request, event, schema, and SSE contracts.
- `packages/chat-client`, `packages/host-bridge`, and `packages/side-chat-widget` own browser-facing integration.
- `packages/db` owns schema contracts, Drizzle schema, and memory/Postgres repository adapters.

Public package consumers use package entrypoints. Relative imports must not cross package, app, or harness boundaries.

Testing architecture is part of the system design. See `docs/architecture/testing-system-design.md` for test lanes, container strategy, repository contracts, and package ownership.
