# Adoptable Assistant Foundation

Read this when: you need the product identity and adoption shape for Side Chat.
Source of truth for: why this repository exists as an ownable assistant
foundation.
Not source of truth for: detailed package boundaries, lifecycle order, or
extension contracts.

## Product Identity

Side Chat is an adoptable enterprise assistant foundation.

An adopting team can take this repository, deploy the service and widget inside
or next to its web app, and keep extending the codebase with its own tools,
RAG, memory, turn guards, host commands, policies, and agent executors.

This repository is not a demo app and is not yet a polished public SDK
framework. It is an ownable codebase with explicit seams for enterprise
assistant behavior.

## Adoptable Shape

```txt
host app
-> side-chat-widget
-> chat-client and chat-protocol
-> partner-ai-service
-> partner-ai-core
-> agent-runtime
-> provider and runtime tools
```

The host app owns its business UI, auth, domain entities, enterprise APIs, and
host-specific permissions. Side Chat owns the assistant UI, browser/server
protocol, deployable backend service composition, core turn lifecycle, runtime
boundary, and extension seams.

## Deployable Service

`apps/partner-ai-service` is the deployable service composition. It owns HTTP
routes, config/auth adapters, persistence adapters, policy adapter wiring,
concrete tool adapters, and SSE conversion at the transport edge.

Service composition wires implementations into core and runtime. It must not
become the owner of product turn lifecycle decisions; those stay in
`partner-ai-core`.

## Local Fixtures

Mock and demo capabilities are local development or test fixtures. They may
prove adapter wiring, stream behavior, or UI activity rendering, but they are
not the default production architecture.

Production profiles must fail closed rather than expose development-only mock
tools by accident.

## Quality Gate

Architecture changes still follow the repository readability and boundary
rules. Keep code and docs boring, explicit, and current-state only.

Open these before changing implementation:

- `AGENTS.md`
- `docs/product/non-functional-requirements.md`
- `docs/architecture/testing-and-verification.md`
- The nearest package `README.md`

## Related Docs

- `docs/domain/vocabulary.md`
- `docs/domain/lifecycle.md`
- `docs/architecture/package-map.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/stream-chat-flow.md`
