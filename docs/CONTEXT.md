# Side-Chat Assistant Context

Status: durable context index

Read this before architecture, product, demo-data, widget, backend, or DB changes. Keep it short. Detailed explanations belong in focused docs, not here.

## Current Intent

This repo is a learning-first production-base for a Workbench-embedded AI side-chat assistant.

The main lesson is the architecture argument: a production ChatGPT-like Workbench assistant needs a typed UI-facing chat boundary. AI SDK 6 should be treated as the backend assistant-runtime engine behind that boundary, with OpenAI, Anthropic, Azure OpenAI, AI Gateway, local, and fake models as provider adapters. A Python/FastAPI or LangGraph service can sit behind the same boundary later, but it should not accidentally become the browser-facing chat product protocol just because a prototype was wrapped and deployed.

The app is feature-complete enough for the current demo. Default future work should be cleanup, tests, docs, teaching, and boundary clarity rather than product expansion.

## User Clarifications To Preserve

- Teach from first principles while working: Effect TS, hexagonal architecture, AI SDK, AI flows, streaming protocols, tool calls, and frontend/backend boundaries.
- Public demos use one shared demo workspace with a browser-local conversation id so each viewer gets isolated chat history and page-control state.
- Assume monorepo consumption; npm publishing hardening is not a priority.
- The model picker is an easter egg/demo affordance unless explicitly made real later.
- If model/provider switching becomes real, back it with an assistant-runtime provider registry rather than OpenAI-specific UI plumbing.
- The fake model is useful for tests/local safety, but the demo should be able to run real provider requests when `.env` is configured.
- Prefer the Advisory Dashboard demo page/data direction before expanding assistant features.

## Current Topology

```txt
apps/
  side-chat-api/        Hono chat API, Effect/application use cases, AI SDK-backed assistant runtime
  dashboard-data-api/   read-only dashboard data API for the host app
  embedded-host-app/    Advisory Dashboard single-page host consuming the widget package
  widget-demo/          isolated widget playground
packages/
  shared-protocol/      sidechat.v1 Effect schemas, DTOs, SSE codec, sequence rules
  side-chat-widget/     reusable React widget package
  db/                   Postgres stored-procedure/function access
docker/postgres/init/   schema and deterministic seed data
```

Use npm workspaces. Do not reintroduce pnpm.

Dependency pins live in `package.json` files and are enforced by `scripts/governance-check.mjs`; do not duplicate the full version table here.

## Focused Docs

- [../SYSTEM-DESIGN.md](../SYSTEM-DESIGN.md): canonical system design, architecture narrative, and first-principles teaching guide.
- [architecture/production-system-design.md](architecture/production-system-design.md): clean production repo system design we will build from.
- [code-walkthrough.md](code-walkthrough.md): practical learning path with local app/package guides, file ownership, and technology-in-context maps.
- [../README.md](../README.md): setup, run commands, protocol summary, and verification commands.
- Package/app `LEARNING.md` files: local code ownership maps for each workspace.
- [../deploy/demo/README.md](../deploy/demo/README.md): single-Droplet demo deployment with Docker Compose and Caddy.

Historical `.omx` plans/reports and old planning docs are workflow scratchpads, not durable project documentation. Keep `docs/` intentionally small: durable context plus the practical code walkthrough.

## Hard Boundaries

- Hono imports belong only under `apps/side-chat-api/src/inbound/hono`, except `apps/dashboard-data-api` owns its own Hono service.
- AI SDK runtime imports belong only under the side-chat API assistant-runtime/AI adapter boundary.
- `pg` imports belong only in `packages/db` and explicit migration/test harnesses.
- `packages/db` must not import Hono, React, AI SDK adapters, widget code, or application use cases.
- Runtime DB access must use stored procedures/functions, not direct application-table SQL from runtime code.
- `apps/embedded-host-app` must consume `@side-chat/side-chat-widget`; it must not import widget internals.
- `packages/side-chat-widget` must not require Next.js runtime APIs, app-local aliases, AG Grid, host app state, or provider SDK runtime objects.
- `packages/side-chat-widget` should place hooks by ownership: application/browser orchestration in `adapters/react`, presentation-only lifecycle beside the relevant `ui/<slice>`, and pure rules in `domain`. Do not reintroduce a global `hooks/` or file-type bucket architecture.
- The browser must not connect directly to Postgres.

## Product Protocol

Protocol version: `sidechat.v1`.

`POST /chat/stream` emits:

- `sidechat.started`
- `sidechat.delta`
- `sidechat.reasoning`
- `sidechat.tool`
- `sidechat.host_command`
- `sidechat.completed`
- `sidechat.error`
- `sidechat.history`

Exactly one terminal event is allowed: `sidechat.completed` or terminal `sidechat.error`. The server and widget should defensively prevent deltas after a terminal event.

The shared protocol is the product contract. It uses Effect Schema as the canonical source of truth for request, stream event, host command, and header shapes. JSON Schema, Standard Schema, or Zod-shaped objects may exist only as adapters at integration boundaries. Do not expose AI SDK provider stream parts directly to the widget.

## Demo Data

The demo should use Postgres-backed data when possible:

- `docker/postgres/init/002_seed.sql` contains the richer demo dataset.
- Current rich seed shape is roughly 102 portfolio review rows, 102 risk rows, 6 product allocation rows, and 6 net-new-money points.
- `apps/dashboard-data-api` fixture mode is for local/e2e safety only and may be smaller unless explicitly updated.

For the full local Docker demo, run one command:

```sh
docker compose up --build demo
```

Then open `http://127.0.0.1:8080`. This path starts Postgres, side-chat API,
dashboard data API, built embedded host app, and local Caddy. It defaults to
`USE_FAKE_MODEL=true`, so it works without provider credentials.

To use a real OpenAI key with the same local Docker demo:

```sh
OPENAI_API_KEY="$OPENAI_API_KEY" USE_FAKE_MODEL=false docker compose up --build demo
```

For manual dev mode, run:

```sh
docker compose up -d postgres
DATABASE_URL=postgres://sidechat_app:sidechat_app@127.0.0.1:5432/sidechat SIDE_CHAT_MODEL_ADAPTER=openai OPENAI_API_KEY="$OPENAI_API_KEY" npm run dev --workspace @side-chat/side-chat-api
DATABASE_URL=postgres://sidechat_app:sidechat_app@127.0.0.1:5432/sidechat PORT=3100 npm run dev --workspace @side-chat/dashboard-data-api
npm run dev --workspace @side-chat/embedded-host-app -- --host 127.0.0.1
```

Use fixture mode only when deterministic no-DB local/e2e behavior is more important than demo richness.

For public demo access, use the single-Droplet demo path in `deploy/demo/README.md`. It is intentionally not the production architecture: one Droplet, Caddy as the only public ingress, app containers on a private Docker network, Postgres private to Compose, and named volumes for demo DB/report persistence.

## Advisory Dashboard Host Direction

The embedded host app is a single-page Advisory Dashboard.

Keep the visual direction restrained: white, charcoal, light gray dividers, sober spacing, and red accent. Avoid playful SaaS blue, gradients, excessive radius, and marketing layouts.

The main business surface is one `Portfolio Worklist` grid combining relationship, portfolio, risk, due-date, RM, and next-action data. Fake navigation, filters, export, pagination, table-row links, and secondary controls should remain inert unless explicitly wired.

## Verification

Typical final check:

```sh
npm run verify
```

Use targeted tests first for narrow changes, then the broad gate when practical. For frontend visual changes, also run browser verification against the local app.
