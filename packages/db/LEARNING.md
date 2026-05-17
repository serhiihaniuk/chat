# DB Package Learning Guide

Status: local learning path

Read this when you want to understand database access. This package is the only runtime owner of Postgres client access. Application code calls package APIs; it does not write direct SQL against application tables.

## Purpose

`packages/db` adapts Postgres stored procedures/functions into TypeScript APIs for chat persistence, usage tracking, and advisory dashboard reads.

```txt
side-chat-api / dashboard-data-api
  -> @side-chat/db
    -> pg Pool
      -> stored procedures/functions
        -> Postgres tables
```

## Owns / Does Not Own

| Owns | Does not own |
| --- | --- |
| `pg` connection pools. | Hono routes. |
| Stored-procedure/function calls. | React/browser code. |
| Runtime parsing of dashboard result shapes. | AI SDK model behavior. |
| Persistence adapter interfaces for chat history and usage. | Chat stream orchestration. |

## Read Order

1. [`src/index.ts`](src/index.ts)  
   Start with chat persistence and package exports.

2. [`src/advisory-dashboard.types.ts`](src/advisory-dashboard.types.ts)  
   Read dashboard DTO shapes.

3. [`src/advisory-dashboard.ts`](src/advisory-dashboard.ts)  
   See stored-function calls and Zod parsing for advisory dashboard data.

4. [`../../docker/postgres/init/001_schema.sql`](../../docker/postgres/init/001_schema.sql)  
   See schema, roles, grants, and stored functions.

5. [`../../docker/postgres/init/002_seed.sql`](../../docker/postgres/init/002_seed.sql)  
   See deterministic demo data.

## Key Files

| File | Why it exists |
| --- | --- |
| `src/index.ts` | Chat persistence adapter plus package exports. |
| `src/advisory-dashboard.ts` | Advisory dashboard stored-function adapter. |
| `src/advisory-dashboard.types.ts` | TypeScript data shapes returned to APIs and host app. |
| `test/schema-security.test.ts` | Verifies role/grant and stored-procedure boundaries. |
| `test/persistence-adapter.test.ts` | Verifies chat persistence adapter behavior. |
| `test/advisory-dashboard.test.ts` | Verifies advisory dashboard reads. |

## Technology Purpose In Context

### Postgres / `pg`

`pg` is isolated here so the rest of the app cannot accidentally become table-SQL-driven. Runtime code calls functions like `sidechat_create_or_get_conversation` and `ubs_get_advisory_dashboard_snapshot`.

### Zod

Zod validates DB result shapes at this adapter boundary. The DB returns unknown JSON/rows; the package converts them into typed dashboard DTOs.

## Boundary Warnings

- Do not import Hono, React, AI SDK, or widget code here.
- Do not add direct runtime table reads/writes from application code.
- Keep stored functions as the runtime access path.
- Keep browser code away from `DATABASE_URL`.

## Verification

Run from the repository root:

```sh
npm run build --workspace @side-chat/db
npm run verify
```

## Read Next

- [Side-Chat API](../../apps/side-chat-api/LEARNING.md) for chat persistence usage.
- [Dashboard Data API](../../apps/dashboard-data-api/LEARNING.md) for dashboard read usage.
