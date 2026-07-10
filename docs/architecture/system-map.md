# System Map

Read this when: you want the whole Side Chat system on one page.
Source of truth for: product identity, package roles, and the first files to open.
Not source of truth for: lifecycle order (see [assistant-turn.md](./assistant-turn.md)), import rules (see [package-boundaries.md](./package-boundaries.md)), or term definitions (see [../domain/vocabulary.md](../domain/vocabulary.md)).

Side Chat is an adoptable assistant starter. A team clones or forks the repo,
embeds the widget, and owns the resulting application. The host keeps its UI,
auth, data, permissions, and business logic. This repo supplies the assistant:
widget, browser protocol, deployable service, product core, runtime boundary,
persistence, and a rendered documentation app. New here? Read this page, then
open the first files in the table.

This repo ships **no production host app**. `apps/partner-ai-service` is a
deployable service, not a demo. Mock and local capabilities are test fixtures
that fail closed outside explicit local profiles (ADR
[0001-no-owned-host-app.md](../adr/0001-no-owned-host-app.md)).

## Four layers

Dependencies point inward; each layer knows only the contract beside it. Two
contract packages cross the boundaries: `chat-protocol` (browser to service) and
`ai-runtime-contract` (core to runtime).

| Layer   | Packages                          | Role                                                                       |
| ------- | --------------------------------- | -------------------------------------------------------------------------- |
| Browser | `side-chat-widget`, `host-bridge` | Render chat; seam to host UI, auth, and commands.                          |
| Service | `apps/partner-ai-service`         | Hono composition root: routes, SSE transport, server-owned turn runner.    |
| Core    | `partner-ai-core`                 | Product workflow, policy, and the `RuntimeEvent` to `sidechat.v1` mapping. |
| Runtime | `agent-runtime`                   | Run one prepared turn against a provider; emit `RuntimeEvent`.             |

## End-to-end flow

A user sends a message. The request travels inward to a provider; events travel
back out, translated once per boundary. The widget gets the conversation list,
history, and model catalog over TanStack Query, but the live turn flows through
an SSE reader, a module-level run store, and a pure reducer instead.

```txt
REQUEST (inward)
host app
  -> side-chat-widget (createSideChatApiClient)
  -> chat-protocol            ChatStreamRequest (sidechat.v1)
  -> partner-ai-service       POST /chat/runs  ->  forks a server-owned fiber
  -> partner-ai-core          prepare turn + run generation
  -> ai-runtime-contract      AiRuntimeRequest
  -> agent-runtime            run executor against provider + runtime tools

EVENTS (outward)  -- three vocabularies, never conflated
agent-runtime      provider / AI-SDK stream parts   (stay inside agent-runtime)
  -> ai-runtime-contract   RuntimeEvent
  -> partner-ai-core       sidechat.v1 events        (mapped here)
  -> partner-ai-service    SSE on the POST /chat/runs response (resume: GET /chat/turns/:id/stream)
  -> side-chat-widget      SSE reader -> run store -> reducer -> message/activity state
```

## Streaming model

Streaming is **connection-bound and server-owned** (ADR
[0007-connection-bound-streaming.md](../adr/0007-connection-bound-streaming.md)).
Generation runs on a server-owned fiber; in-flight events live in a
per-instance, in-memory registry, and Postgres holds the durable final state. A
reload reads history from the DB once the turn is terminal — it does not replay
a live stream. A resume that reaches a non-owner instance fails fast, then the
widget polls durable status and hands the terminal run to refetched history. For
the full lifecycle, see [assistant-turn.md](./assistant-turn.md).

| Call           | Method + path                                         | Does                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start + stream | `POST /chat/runs`                                     | Runs pre-start synchronously, forks generation onto a server-owned fiber keyed by `assistantTurnId`, then streams the turn as SSE on this same response — `sidechat.started` (sequence 0) carries the turn identity. |
| Resume         | `GET /chat/turns/:assistantTurnId/stream?after=<seq>` | Same-instance resume: opens SSE, replays the in-memory registry from `<seq>`, then tails live events to the terminal one.                                                                                            |
| Activity       | `GET /chat/activity`                                  | Subject-scoped SSE pushing cross-conversation turn lifecycle; powers the "generating" dot on chats you are not viewing.                                                                                              |

Two near-identical event names — do not conflate them. `sidechat.activity` carries
reasoning and tool steps **inside** one turn (codec `sse-codec.ts`).
`sidechat.turn-activity` carries cross-conversation lifecycle on `/chat/activity`
(codec `activity-sse-codec.ts`), both in `chat-protocol`.

## Package map

Twelve workspaces. Open the first files to orient; each package README owns its
local detail.

| Package                         | Owns                                                                                                                                                                                                                       | Must NOT own                                                                 | First files to open                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/docs`                     | Rendered contributor documentation, walkthroughs, design-system previews, glossary helpers, and source-backed examples.                                                                                                    | Product runtime behavior, canonical architecture truth, service routes.      | `content/docs/walkthrough/`, `app/components/`, `README.md`                                                                                                 |
| `apps/partner-ai-service`       | Deployable Hono service: routes, config parsing, SSE transport, the server-owned turn runner (`FiberMap` by `assistantTurnId`), the in-memory turn-event registry, cancel/activity dispatchers, the host-command resolver. | Product lifecycle, provider internals, widget state, a host app.             | `src/inbound/http/app.ts`, `src/inbound/turn-runner/turn-runner.ts`, `src/composition/service-composition.ts`, `sidechat.config.ts`                         |
| `packages/partner-ai-core`      | Stream-chat workflow, policy, context, capability contracts, ports, lifecycle, `RuntimeEvent` to `sidechat.v1` mapping.                                                                                                    | Hono, DB rows, provider SDKs, React, `agent-runtime`.                        | `src/application/stream-chat/README.md`, `src/application/stream-chat/protocol/run-turn-generation.ts`, `src/ports/index.ts`                                |
| `packages/ai-runtime-contract`  | Provider-neutral core/runtime boundary: `AiRuntimeRequest`, `AiRuntimePort`, the `RuntimeEvent` union, branded ids, error/finish/blocked codes.                                                                            | Product lifecycle, provider adapters, executable tools, browser protocol.    | `src/index.ts`, `README.md`                                                                                                                                 |
| `packages/agent-runtime`        | One prepared turn: `streamEffect`, executor registry, AI-SDK tool-loop executor, runtime tools, provider adapters (OpenAI/Azure/fake), host-command tool exposure.                                                         | Product policy, persistence, browser protocol.                               | `src/runtime/README.md`, `src/runtime/agent-runtime.ts`                                                                                                     |
| `packages/chat-protocol`        | Browser `sidechat.v1`: request/event DTOs, validators, sequence checks, the turn and activity SSE codecs, schema JSON, version const.                                                                                      | Runtime events, provider parts, Hono, Effect, React.                         | `src/sidechat-v1/index.ts`, `README.md`                                                                                                                     |
| `packages/side-chat-widget`     | Embeddable React widget: public API, browser-safe API client + SSE/activity readers, TanStack-Query conversation/history repository, FSD layers, themes.                                                                   | Effect, provider SDKs, DB rows, service internals.                           | `src/widgets/side-chat/index.ts`, `src/features/chat/model/run/widget-run-store.ts`, `src/entities/conversation/api/`, `src/entities/conversation/index.ts` |
| `packages/host-bridge`          | Browser host seam: host-context provider and host-command capability, dispatch, and result shapes.                                                                                                                         | RuntimeTool execution, backend persistence, service routes.                  | `src/bridge/bridge.ts`, `src/commands/`, `src/context/host-context.ts`                                                                                      |
| `packages/db`                   | Persistence: schema contract, Drizzle/Postgres + in-memory repositories, turn records and lease ops, and dedicated cancel/activity/host-command-result `LISTEN/NOTIFY` connections.                                        | Product use cases, Hono routes, runtime execution, widget state.             | `src/schema-contract/index.ts`, `src/repositories/index.ts`, `src/drizzle/schema.ts`                                                                        |
| `packages/shared`               | Domain-neutral TS helpers: `Brand<>`, JSON value types, record narrowing, omit-undefined helpers. Zero deps.                                                                                                               | Product, protocol, runtime, widget, or persistence ownership.                | `src/index.ts`                                                                                                                                              |
| `test-harness/adoption-harness` | Cross-package adopter golden-path tests over an in-process service.                                                                                                                                                        | Browser/Playwright scenarios, production deployment, real provider behavior. | `src/adoption-golden-path.test.ts`                                                                                                                          |
| `test-harness/widget-harness`   | Browser harness: Vite dev app, iframe host proxy, mock-stream and local-service modes, fake host bridge, Playwright pages.                                                                                                 | Production host app, service policy, provider config.                        | `src/app/harness-app.tsx`, `e2e/`                                                                                                                           |

## Invariants

- **Provider details stay in `agent-runtime`.** Only it imports `ai` and
  `@ai-sdk/*`; provider stream parts never leave it.
- **Core never imports `agent-runtime`.** It reaches the runtime only through
  `AiRuntimePort` from `ai-runtime-contract`.
- **Three event vocabularies, mapped once per boundary**: provider parts ->
  `RuntimeEvent` -> `sidechat.v1`. The `RuntimeEvent` to `sidechat.v1` step
  happens in `partner-ai-core`.
- **Boundary tools differ from host commands.** Model-callable `RuntimeTool`s
  run in service/runtime; host commands dispatch in the browser through
  `host-bridge`.
- **The widget is Effect-free and provider-free.** It depends only on
  `chat-protocol`, `host-bridge`, and `shared`.
- **`hono` lives only in the service; `pg`/`drizzle-orm` only in `db`.**
  `process.env` reads stay in `*.test.ts` or the service config adapter.
- **Streaming is connection-bound.** Live events exist only in the owning
  instance's in-memory registry; Postgres holds the durable final state, and
  generation runs on a server-owned fiber independent of any socket.
- **Idempotency is `requestId`-only.** No request-fingerprint or 409 path exists.
- **The repo ships no production host app.**
