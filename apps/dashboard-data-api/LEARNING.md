# Dashboard Data API Learning Guide

Status: local learning path

Read this when you want to understand how the host dashboard receives advisory data. This app is intentionally separate from the chat API so the Workbench page can load dashboard data without coupling browser rendering to the assistant backend.

## Purpose

`apps/dashboard-data-api` exposes read-only advisory dashboard endpoints. It adapts Hono HTTP routes to an `AdvisoryDashboardReader`, which is usually backed by `packages/db` and can be replaced by a fixture reader for deterministic local/e2e runs.

```txt
Embedded host app
  -> /advisory-dashboard/snapshot
    -> dashboard-data-api Hono route
      -> AdvisoryDashboardReader
        -> packages/db stored functions or fixture data
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| Read-only dashboard HTTP endpoints. | Chat streaming or model/tool orchestration. |
| Selection between Postgres and fixture reader. | Browser table state or widget host commands. |
| Dashboard API config parsing. | SQL implementation details. |
| JSON serialization of advisory dashboard records. | Shared `sidechat.v1` protocol events. |

## Read Order

1. [`src/advisory-dashboard-port.ts`](src/advisory-dashboard-port.ts)  
   Start with the reader contract.

2. [`src/app.ts`](src/app.ts)  
   See route ownership and default dependency construction.

3. [`src/config.ts`](src/config.ts)  
   See how environment variables choose port and data source.

4. [`src/fixture-dashboard.ts`](src/fixture-dashboard.ts)  
   See the deterministic no-DB data source used for tests/local safety.

5. [`src/server.ts`](src/server.ts)  
   See Node server startup.

## Key Files

| File | Why it exists |
| --- | --- |
| `src/advisory-dashboard-port.ts` | Defines the read side of the dashboard data boundary. |
| `src/app.ts` | Creates the Hono app and registers dashboard JSON routes. |
| `src/config.ts` | Parses `PORT`, `DASHBOARD_DATA_SOURCE`, and `DATABASE_URL` with Zod. |
| `src/fixture-dashboard.ts` | Provides deterministic data without Postgres. |
| `src/server.ts` | Starts the Hono Node server. |

## Technology Purpose In Context

### Hono

Hono is a small HTTP adapter here. It maps routes like `/advisory-dashboard/snapshot` to reader methods and returns JSON. There is no chat workflow in this service.

### Postgres / `pg`

This app does not import `pg` directly. It consumes `createPostgresAdvisoryDashboardDb` from `@side-chat/db`, which owns the Postgres client and stored-function calls.

### Zod

Zod is used for environment parsing here because this is an app-local runtime configuration boundary. It is not the shared chat protocol owner.

## Boundary Warnings

- Keep this API read-only.
- Do not add chat routes here.
- Do not connect browser code directly to Postgres.
- Do not duplicate dashboard SQL in this app; keep DB access in `packages/db`.

## Verification

Run from the repository root:

```sh
npm run build --workspace @side-chat/dashboard-data-api
npm run verify
```

## Read Next

- [Embedded Host App](../embedded-host-app/LEARNING.md) for the browser consumer.
- [DB Package](../../packages/db/LEARNING.md) for dashboard stored-function access.
