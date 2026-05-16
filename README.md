# Workbench Side-Chat Assistant

A production-shaped TypeScript foundation for an AI side-chat embedded inside a Workbench-style application.

The demo app is a UBS Partner advisory workbench with a reusable side-chat widget, a typed streaming protocol, a Hono/Effect backend, AI SDK provider adapters, and Postgres-backed dashboard data behind stored procedures.

## What This App Proves

This project exists to demonstrate one architecture argument:

For a ChatGPT-like assistant embedded in a product UI, the hard part is not only calling a model. The hard part is the product protocol between the browser and the backend.

That protocol has to handle:

- streaming assistant text
- reasoning/status blocks
- tool-call states
- citations and sources
- host UI commands
- usage metadata
- provider switching
- retries and errors
- typed frontend/backend contracts

The repo keeps that browser-facing contract in Node.js/TypeScript as `sidechat.v1`. AI SDK is used where it is strongest: inside the provider adapter. A future Python/LangGraph service can sit behind this boundary for RAG or complex agent workflows, but it should not accidentally become the UI-facing chat protocol.

For the full architecture explanation, read [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md).

## Demo Surface

The main demo is `apps/embedded-host-app`: a single-page UBS Partner advisory workbench.

It shows:

- a realistic dashboard surface with client portfolio review data
- a reusable `@side-chat/side-chat-widget` embedded into the host
- host context passed into the assistant
- streamed assistant responses through `sidechat.v1`
- reasoning, tool, citation, and host-command event types
- dashboard data served through a separate read-only API
- Postgres data access isolated behind `packages/db`

The demo intentionally uses one fixed conversation id for now: `demo-conversation-001`.

## Workspace Topology

```txt
apps/
  side-chat-api/        Hono chat API, application use case, Effect boundary, AI SDK adapter
  dashboard-data-api/   read-only dashboard data API for the host app
  embedded-host-app/    UBS Partner host app consuming the widget package
  widget-demo/          isolated widget playground
packages/
  shared-protocol/      sidechat.v1 Effect schemas, DTOs, SSE codec, sequence validation
  side-chat-widget/     reusable React side-chat widget with frontend hexagon slices
  db/                   Postgres stored-procedure/function access
docker/postgres/init/   schema and deterministic seed data
```

This is an npm workspace monorepo. Do not use pnpm for this repo.

## Architecture In One Screen

```txt
Embedded Workbench Host
  -> @side-chat/side-chat-widget
    -> @side-chat/shared-protocol (sidechat.v1)
      -> apps/side-chat-api Hono inbound adapter
        -> streamChat application use case
          -> ports
            -> AI SDK model adapter
            -> conversation/usage repository
            -> Workbench tools adapter
            -> report adapter
            -> auth/rate/billing/observability adapters

Host dashboard
  -> apps/dashboard-data-api
    -> packages/db
      -> Postgres stored procedures/functions
```

The important rule: the browser consumes `sidechat.v1`, not provider stream parts from AI SDK or OpenAI.

## Protocol Schema Ownership

`packages/shared-protocol` is the canonical contract package. It now defines `sidechat.v1` with Effect Schema first, then exports derived TypeScript types and validation helpers.

That gives the repo one source of truth:

```txt
Effect Schema
  -> TypeScript types
  -> runtime decoders
  -> future JSON Schema / Standard Schema adapters when an integration needs them
```

Zod is still allowed inside adapters when a library expects it, such as AI SDK tool input schemas. It does not own the product protocol.

## Widget Architecture

`packages/side-chat-widget` is a frontend hexagon:

- `domain/` owns pure widget rules such as message presentation, citation selection, model aliases, appearance presets, and panel geometry.
- `application/` owns UI workflows where a boundary matters, currently the Effect-based stream-frame decoder.
- `hooks/` adapt browser fetch/SSE, history/usage calls, and host bridge callbacks into React state.
- `ui/` contains focused React components for launcher, header, conversation, message rendering, quick actions, composer, status, and resize handles.
- `SideChatWidget.tsx` composes those pieces as the public package shell.

The teaching version: Effect owns the frontend workflow around decoding, shared protocol owns the schema, and React owns rendering.

## Requirements

- Node.js 24+ with npm 11+
- Docker and Docker Compose for Postgres-backed demo data
- Playwright browser dependencies for `npm run test:e2e`
- An OpenAI API key only when running real provider requests

Install dependencies from the repository root:

```sh
npm install
```

## Run The Full Demo

Start Postgres:

```sh
docker compose up -d postgres
```

Start the side-chat API with real provider requests:

```sh
DATABASE_URL=postgres://sidechat_app:sidechat_app@127.0.0.1:5432/sidechat \
SIDE_CHAT_MODEL_ADAPTER=openai \
OPENAI_API_KEY="$OPENAI_API_KEY" \
npm run dev --workspace @side-chat/side-chat-api
```

Start the dashboard data API:

```sh
DATABASE_URL=postgres://sidechat_app:sidechat_app@127.0.0.1:5432/sidechat \
PORT=3100 \
npm run dev --workspace @side-chat/dashboard-data-api
```

Start the embedded host app:

```sh
npm run dev --workspace @side-chat/embedded-host-app -- --host 127.0.0.1
```

Open:

```txt
http://127.0.0.1:5173
```

The Vite host proxies chat routes to `http://127.0.0.1:3000` and dashboard routes to `http://127.0.0.1:3100`.

## Other Local Modes

| Mode | Use when | Command |
| --- | --- | --- |
| Deterministic chat | You want no provider credentials and stable local output | `USE_FAKE_MODEL=true npm run dev --workspace @side-chat/side-chat-api` |
| Widget demo | You want to inspect the reusable widget outside the host app | `npm run dev --workspace @side-chat/widget-demo -- --host 127.0.0.1` |
| Playwright e2e | You want automated browser coverage for the integrated host path | `npm run test:e2e` |
| Docker API smoke | You want Postgres plus side-chat API in containers | `docker compose up --build` |

`docker compose up --build` starts Postgres and the side-chat API. It passes `SIDE_CHAT_MODEL_ADAPTER=openai` and `USE_FAKE_MODEL=false`, so real stream calls need `OPENAI_API_KEY` in the shell environment. Health checks and DB startup can still be inspected without sending a chat request.

## Local URLs

| Surface | URL |
| --- | --- |
| Embedded host app | `http://127.0.0.1:5173` |
| Side-chat health | `http://127.0.0.1:3000/health` |
| Side-chat stream | `POST http://127.0.0.1:3000/chat/stream` |
| Side-chat models | `http://127.0.0.1:3000/models` |
| Dashboard health | `http://127.0.0.1:3100/dashboard-health` |
| Dashboard snapshot | `http://127.0.0.1:3100/advisory-dashboard/snapshot` |

## Environment Variables

| Variable | Default | Used by | Purpose |
| --- | --- | --- | --- |
| `PORT` | `3000` for side-chat API, `3100` for dashboard API | API apps | Listen port. |
| `DATABASE_URL` | unset for side-chat API, local Postgres default for dashboard API | API apps | Enables Postgres-backed repositories and dashboard data. |
| `SIDE_CHAT_MODEL_ADAPTER` | unset | side-chat API | Set to `openai` to use the OpenAI adapter. |
| `OPENAI_API_KEY` | unset | side-chat API | Required for real OpenAI requests. |
| `USE_FAKE_MODEL` | `false` outside tests | side-chat API | Set to `true` for deterministic local responses. |
| `SIDE_CHAT_DEFAULT_USER_ID` | `local-user` | side-chat API | User id used until a real auth adapter exists. |
| `SIDE_CHAT_ALLOWED_WORKSPACE_IDS` | unset | side-chat API | Optional comma-separated workspace allowlist. |
| `SIDE_CHAT_BLOCKED_WORKSPACE_IDS` | unset | side-chat API | Optional comma-separated workspace blocklist. |
| `SIDE_CHAT_RATE_LIMITING_ENABLED` | `true` | side-chat API | Enables the current placeholder rate-limit port. |
| `SIDE_CHAT_BILLING_ENABLED` | `true` | side-chat API | Enables the current placeholder billing port. |
| `DASHBOARD_DATA_SOURCE` | `postgres` | dashboard data API tests/config | Can be `postgres` or `fixture`; fixture mode is for deterministic e2e. |
| `SIDE_CHAT_API_PROXY_TARGET` | `http://127.0.0.1:3000` | embedded host dev server | Overrides the Vite proxy target for chat routes. |

## Verification

Run the broad local gate:

```sh
npm run verify
```

Individual commands:

```sh
npm run lint          # governance and architecture boundary checks
npm run typecheck     # TypeScript project references
npm test              # Vitest
npm run build         # tsc -b
npm run test:e2e      # Playwright integrated host path
```

`npm run lint` is more than formatting. It enforces dependency pins, naming constraints, Hono/AI SDK/pg import boundaries, shared protocol isolation, AI Elements packaging constraints, and stored-procedure DB rules.

## Protocol And Boundaries

- Protocol version: `sidechat.v1`.
- Required request header: `X-Sidechat-Protocol: sidechat.v1`.
- Stream endpoint: `POST /chat/stream` with `Accept: text/event-stream`.
- The widget consumes shared protocol events, not AI SDK provider stream parts.
- Hono imports belong under side-chat API inbound adapters.
- AI SDK runtime imports belong under side-chat API AI adapters.
- `pg` imports belong in `packages/db` and explicit test/migration harnesses.
- Runtime DB access goes through stored procedures/functions.
- The embedded host consumes `@side-chat/side-chat-widget`; it must not import widget internals.
- The browser must not connect directly to Postgres.

## Current Transition States

The app is feature-complete enough for the current demo, but some boundaries are intentionally still visible as transition points:

- The chat API currently builds a `WorkbenchToolsPort` that can read the same advisory data used by the host dashboard. That is explicit and acceptable for the monorepo demo, but it is still a boundary to watch.
- Effect is present at the request boundary and as a narrow workflow spike. It is not yet a full service/layer rewrite.
- The model picker is a demo affordance, not a full provider-management product.
- The fixed demo conversation is intentional for now.
- Real provider requests require explicit environment configuration and are not part of deterministic CI evidence.

## Documentation Map

- [SYSTEM-DESIGN.md](./SYSTEM-DESIGN.md): canonical architecture and first-principles explanation.
- [docs/CONTEXT.md](./docs/CONTEXT.md): compact durable context index.
- [docs/architecture/current.md](./docs/architecture/current.md): brownfield implementation map.
- [docs/architecture/transition-roadmap.md](./docs/architecture/transition-roadmap.md): refactor path and stop rules.
- [docs/architecture/widget-hexagon.md](./docs/architecture/widget-hexagon.md): reusable widget frontend hexagon.
- [docs/learning/hexagonal-architecture.md](./docs/learning/hexagonal-architecture.md): ports/adapters primer.
- [docs/learning/effect-ts.md](./docs/learning/effect-ts.md): Effect TS primer.
- [docs/learning/ai-sdk-streaming-and-tools.md](./docs/learning/ai-sdk-streaming-and-tools.md): AI SDK stream/tool primer.
- [docs/learning/frontend-backend-boundaries.md](./docs/learning/frontend-backend-boundaries.md): widget, host, and protocol boundary primer.
