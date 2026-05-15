# side-chat

Side-chat assistant monorepo with a Hono backend, reusable React widget, embedded host app, shared streaming protocol, and Postgres boundary package.

## Workspace topology

- `apps/side-chat-api` — Hono inbound adapter and streaming chat application.
- `apps/embedded-host-app` — Vite host app used by Playwright end-to-end checks.
- `apps/widget-demo` — standalone Vite widget demo.
- `packages/side-chat-widget` — reusable React widget package.
- `packages/shared-protocol` — `sidechat.v1` DTOs, SSE helpers, contracts, and sequence validation.
- `packages/db` — Postgres stored-procedure boundary wrapper.
- `docker/postgres/init/001_schema.sql` — schema, functions, grants, and current deterministic seed data.

## Requirements

- Node.js 24+ (verified locally with npm 11).
- npm workspaces from the root `package.json`.
- Docker and Docker Compose for Postgres/API container checks.
- Playwright browser dependencies for `npm run test:e2e`.

This repository currently uses npm workspace scripts as the runnable interface. A historical `pnpm-lock.yaml` may exist, but the documented commands below use npm because that is what `package.json` exposes and what Docker Compose runs.

## Install

```sh
npm install
```

## Root commands

Run these from the repository root:

```sh
npm run lint          # governance boundary/dependency/static checks
npm run typecheck     # tsc -b across the workspace
npm test              # vitest run
npm run test:e2e      # Playwright against API + embedded host web servers
npm run build         # tsc -b
npm run verify        # lint + typecheck + vitest
```

Workspace-specific commands:

```sh
npm run dev --workspace @side-chat/side-chat-api
npm run dev --workspace @side-chat/widget-demo
npm run dev --workspace @side-chat/embedded-host-app
npm run test:e2e --workspace @side-chat/embedded-host-app
npm run build --workspace @side-chat/side-chat-api
npm run build --workspace @side-chat/db
npm run build --workspace @side-chat/shared-protocol
npm run build --workspace @side-chat/side-chat-widget
```

## Local app URLs

Default local ports:

- API health: `http://127.0.0.1:3000/health`
- API stream endpoint: `POST http://127.0.0.1:3000/chat/stream`
- Embedded host app: `http://127.0.0.1:5173`
- Widget demo: Vite prints its chosen URL; use `-- --host 127.0.0.1` for loopback-only runs.

`npm run test:e2e` starts the API and embedded host through Playwright web servers. It reuses existing servers when present, so clean stale ports before relying on e2e evidence.

## Environment variables

Backend/runtime variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | API listen port for `apps/side-chat-api/src/server.ts`. |
| `SIDE_CHAT_MODEL_ADAPTER` | fake adapter unless set to `openai` with a key | Selects the OpenAI adapter only when `SIDE_CHAT_MODEL_ADAPTER=openai` and `OPENAI_API_KEY` is present. |
| `OPENAI_API_KEY` | unset | Required only for the OpenAI model adapter. Tests and local deterministic runs should omit it. |
| `SIDE_CHAT_DEFAULT_USER_ID` | `local-user` | User id supplied to application ports when no auth layer is present. |
| `DATABASE_URL` | unset in the root dev command; set in Docker Compose | Postgres connection string for DB-backed runtime integration when that lane is wired in. |
| `USE_FAKE_MODEL` | `true` in Docker Compose | Keeps container runs deterministic. |

Docker Compose sets:

```sh
DATABASE_URL=postgres://sidechat_app:sidechat_app@postgres:5432/sidechat
USE_FAKE_MODEL=true
```

## Docker/Postgres workflow

Start the API plus Postgres:

```sh
docker compose up --build
```

Run in the background:

```sh
docker compose up --build -d
```

Reset the database and containers:

```sh
docker compose down -v --remove-orphans
docker compose up --build
```

Cleanup after verification:

```sh
docker compose down --remove-orphans
# include -v when you intentionally want to remove the Postgres volume:
docker compose down -v --remove-orphans
```

Current residual Docker limitation: the checked-in Compose file still uses `postgres:18`, while the PRD target calls for Postgres 16. Treat this as an open backend lane item until the Compose image is changed and verified. Seed data currently lives in `001_schema.sql`; the PRD target calls for a separate `docker/postgres/init/002_seed.sql`.

## No-dev-server cleanup expectation

Do not leave local API, Vite, Playwright, or Docker servers running after manual verification. Before final handoff, check the usual ports and Compose state:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
docker compose ps
```

Stop leftovers with the owning terminal, Playwright cleanup, or Docker Compose cleanup commands above. Do not kill unrelated processes without confirming ownership.

## Protocol and governance

- Streaming protocol version: `sidechat.v1`.
- Required request header: `X-Sidechat-Protocol: sidechat.v1`.
- Stream endpoint: `POST /chat/stream` with `Accept: text/event-stream`.
- Governance check: `npm run lint` enforces dependency pins, naming constraints, package boundaries, Hono/AI SDK/pg import boundaries, shared protocol isolation, and required stored procedures.
- More governance detail lives in `docs/governance-and-verification.md`.

## Known residual limitations

- DB persistence is still an integration risk unless the API runtime is wired to `packages/db` through `DATABASE_URL`; the deterministic in-memory/fake path remains important for local tests.
- Postgres image and seed-file split still need to match the PRD target as noted above.
- Effect usage exists as an application-layer spike; deeper Effect v4 composition is still a larger follow-up.
- Real OpenAI calls require explicit environment configuration and are intentionally not part of deterministic CI/local verification.
