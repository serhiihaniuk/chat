# Architecture Overview

Side Chat is an embeddable AI chat product without an owned host app. The production shape is a modular monolith:

- `apps/partner-ai-service` owns HTTP, service composition, runtime adapters, and deployment entrypoints.
- `packages/partner-ai-core` owns pure authority, policy, Effect-first stream orchestration, context-board product workflows, ports, typed errors, and Effect service wiring.
- `packages/agent-runtime` owns AI SDK-backed model execution, provider translation, runtime tool protocol, and normalized runtime events.
- `packages/chat-protocol` owns request, event, schema, and SSE contracts.
- `packages/chat-client`, `packages/host-bridge`, and `packages/side-chat-widget` own browser-facing integration.
- `packages/db` owns schema contracts, Drizzle schema, and memory/Postgres repository adapters.

Public package consumers use package entrypoints. Relative imports must not cross package, app, or harness boundaries.

Server/core workflows are Effect-first. `partner-ai-core` ports use Effect for
async/failing dependencies, `agent-runtime` exposes an Effect stream for
assistant turns, and `partner-ai-service` adapts HTTP/database/provider edges
into those workflows. Browser/client/widget public APIs remain plain protocol
and React-friendly TypeScript.

The final server runtime shape has no package-level alternate stream facades.
`partner-ai-core` exposes `streamChatEffect(input)` through Effect
services/layers. `agent-runtime` exposes `streamEffect(request)`. Conversion to
plain `AsyncIterable` belongs only at transport edges that require it, such as
the SSE response writer.

Testing architecture is part of the system design. See `docs/architecture/testing-system-design.md` for test lanes, container strategy, repository contracts, and package ownership.
