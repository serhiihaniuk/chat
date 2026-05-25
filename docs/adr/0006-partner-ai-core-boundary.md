# ADR 0006: Backend Core Boundary

Status: accepted

Backend core is hexagonal and framework-free. It owns authority normalization,
policy decisions, context-board product workflow, stream orchestration, typed
errors, ports, observability services, and Effect runtime wiring.

Hono, Drizzle, Postgres, React, browser clients, widget code, and provider SDKs are rejected inside partner AI core. Those concerns belong in app or adapter packages.

Core use cases expose Effect programs directly. The accepted chat-stream surface
is `streamChatEffect(input)`, with app-owned ports supplied by
`createPartnerAiCoreLayer(...)`. Promise or `AsyncIterable` wrappers are edge
adapter concerns, not parallel core APIs.
