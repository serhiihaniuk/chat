# System Map

Read this when: you need the whole Side Chat system on one page.
Source of truth for: product identity, package roles, and first files to open.
Not source of truth for: detailed lifecycle order, extension contracts, or term
definitions.

Side Chat is an adoptable enterprise assistant foundation. A host app embeds the
widget, calls the service, and keeps owning its business UI, auth, data,
permissions, and host-specific behavior. This repo owns the assistant UI,
browser protocol, widget-owned browser API adapter, deployable service
composition, product core, runtime boundary, persistence contracts, and
extension seams.

`apps/partner-ai-service` is deployable service composition, not a demo app. Mock
or local capabilities are fixtures and must fail closed outside explicit local
profiles.

## Flow

```txt
host app
-> side-chat-widget
-> widget API client
-> chat-protocol
-> partner-ai-service
-> partner-ai-core
-> ai-runtime-contract
-> agent-runtime
-> provider and runtime tools

ai-runtime-contract RuntimeEvent emitted by agent-runtime
-> partner-ai-core SidechatStreamEvent
-> widget API client
-> side-chat-widget message/activity state
```

## Streaming Model

Streaming is resumable and server-owned, not one linear response. A turn runs in
two HTTP calls so generation outlives any one connection:

1. `POST /chat/runs` runs pre-start synchronously and returns the turn identity as
   JSON (`{protocolVersion, requestId, assistantTurnId, conversationId, status}`).
   The service then forks generation onto a server-owned fiber.
2. `GET /chat/turns/:assistantTurnId/stream?after=<seq>` opens an SSE stream that
   replays the durable log from `after` and tails live events to the terminal one.

The durable `turn_events` log is the source of truth; the browser is only a
subscriber, so a reconnect resumes the same turn. `GET /chat/activity` is a
separate subject-scoped SSE stream that pushes turn lifecycle across
conversations, so the sidebar shows a live "generating" dot even on chats that
are not open. For the full lifecycle, ownership, and recovery rules, see
`docs/architecture/assistant-turn.md`.

## Package Map

| Package                         | Owns                                                                                                                     | Must not own                                                          | First files to open                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/partner-ai-service`       | HTTP routes, env/config parsing, app adapters, service composition, SSE transport, the server-owned turn runner (`FiberMap` by `assistantTurnId`), the event/cancel/activity dispatchers, and the reaper and pruner. | Product lifecycle decisions, provider internals, widget state.        | `src/inbound/http/app.ts`, `src/inbound/turn-runner/turn-runner.ts`, `src/composition/service-composition.ts` |
| `packages/partner-ai-core`      | Stream-chat workflow, policy, context, capability contracts, ports, lifecycle, protocol mapping.                         | Hono, DB rows, provider SDKs, React.                                  | `src/application/stream-chat/README.md`, `src/application/stream-chat/protocol/run-turn-generation.ts` |
| `packages/ai-runtime-contract`  | Provider-neutral runtime request, tool scope, RuntimeEvent, error, stream, and port contracts.                           | Product lifecycle, provider adapters, tools, browser protocol.        | `src/index.ts`, `README.md`                                                                   |
| `packages/agent-runtime`        | Prepared assistant turn execution, executors, runtime tools, provider adapter, RuntimeEvents.                            | Product policy, persistence, browser protocol, host-command dispatch. | `src/runtime/README.md`, `src/runtime/agent-runtime.ts`                                       |
| `packages/chat-protocol`        | `sidechat.v1` request/event DTOs, validators, SSE codec, generated schema.                                               | Runtime events, provider parts, Hono, Effect, React.                  | `src/sidechat-v1/index.ts`                                                                    |
| `packages/side-chat-widget`     | React widget, browser-safe API client/SSE reader, query repository, FSD layers, protocol-to-UI state, host bridge usage. | Effect, provider SDKs, DB rows, service internals.                    | `src/widgets/side-chat/`, `src/features/chat/model/run/widget-run-store.ts`, `src/entities/conversation/api/`, `src/entities/conversation/` |
| `packages/host-bridge`          | Browser host context and host-command dispatch seam.                                                                     | RuntimeTool execution, backend persistence, service routes.           | `src/bridge/bridge.ts`, `src/commands/`                                                       |
| `packages/db`                   | Persistence schema, repository contracts, adapters, in-memory repositories, and the dedicated `LISTEN/NOTIFY` connection and notification source. | Product use cases, Hono routes, runtime execution, widget state.      | `src/schema-contract/`, `src/repositories/`                                                   |
| `packages/shared`               | Domain-neutral TypeScript helpers.                                                                                       | Product, protocol, runtime, widget, or persistence ownership.         | `src/index.ts`                                                                                |
| `packages/testing`              | Shared test-only helpers.                                                                                                | Production behavior or package-specific business fixtures.            | `src/index.ts`                                                                                |
| `test-harness/adoption-harness` | Cross-package adopter golden-path tests.                                                                                 | Production deployment or browser-only harness behavior.               | `src/adoption-golden-path.test.ts`                                                            |
| `test-harness/widget-harness`   | Vite/Playwright widget harness modes.                                                                                    | Production host app behavior or service policy.                       | `src/app/harness-app.tsx`, `e2e/`                                                             |

## Invariants

- Product policy, portable capability configuration contracts, and prepared
  context stay in `partner-ai-core`.
- Shared core-to-runtime request and event shapes stay in `ai-runtime-contract`.
- Provider and AI SDK details stay in `agent-runtime`.
- Browser contracts stay in `chat-protocol`, `host-bridge`, and the widget
  package's API/UI surfaces.
- Env parsing and concrete enterprise adapter modes live in service composition
  and are injected through core/runtime ports.
- The repo does not ship a production host app.
