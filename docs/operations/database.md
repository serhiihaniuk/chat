# Database Tooling

Read this when: you change the schema, rebuild a local Postgres, or wonder why there is no migration history.
Source of truth for: the `db:generate` and `db:reset` workflow, the day-one migration convention, and the three Postgres roles.
Not source of truth for: how `SIDECHAT_DATABASE_URL` is declared or resolved — see [configuration.md](./configuration.md).

Side Chat persists chats in a Postgres schema named `sidechat`. Drizzle generates the table DDL offline; it never touches a live database. You apply that DDL with one command, `db:reset`, which drops and rebuilds the schema from scratch. There is no incremental migration chain and no `drizzle-kit migrate`/`push` path — the schema is always regenerated whole from `packages/db/src/drizzle/schema.ts`.

## Two commands

Run both from the repo root. Edit `packages/db/src/drizzle/schema.ts`, then:

| Command | Does | Entry point |
| --- | --- | --- |
| `npm run db:generate` | Wipes `packages/db/migrations`, then emits exactly one migration named `day_one` from `schema.ts`. | [`scripts/db-generate.mjs`](../../scripts/db-generate.mjs) |
| `npm run db:reset` | Resolves the connection, then drops the `sidechat` schema, recreates it, applies the migration, and applies role grants. | [`apps/partner-ai-service/scripts/reset-database.ts`](../../apps/partner-ai-service/scripts/reset-database.ts) |

`db:generate` produces DDL files; it does not connect to Postgres. `db:reset` is the only path that touches a database.

## The day-one convention

`db:generate` regenerates the whole schema, not a delta. It runs `rm -rf packages/db/migrations`, then `drizzle-kit generate --name day_one` ([`scripts/db-generate.mjs:11-16`](../../scripts/db-generate.mjs)). Every schema change replaces the single `day_one` migration. Do not expect an incremental journal chain or a numbered migration history to review.

## What db:reset does

`db:reset` resolves `SIDECHAT_DATABASE_URL` through the service, then rebuilds the schema from a clean state. The resolve and apply split across two files:

1. **Resolve.** `reset-database.ts` opportunistically loads a `.env`, then calls the service's `readDatabaseUrl()`. It exits with an error if `SIDECHAT_DATABASE_URL` is unset ([`reset-database.ts:20-24`](../../apps/partner-ai-service/scripts/reset-database.ts)). Tooling never re-reads the env contract; the service owns it.
2. **Apply.** `applySidechatSchema` runs four steps in order ([`scripts/lib/apply-sidechat-schema.mjs:28-33`](../../scripts/lib/apply-sidechat-schema.mjs)):

| Step | SQL |
| --- | --- |
| Drop | `DROP SCHEMA IF EXISTS sidechat CASCADE` |
| Create | `CREATE SCHEMA "sidechat"` |
| Migrate | Apply every generated migration in journal order. |
| Grant | Apply [`packages/db/sql/runtime-role-grants.sql`](../../packages/db/sql/runtime-role-grants.sql). |

The apply layer creates the schema itself because the generated migration assumes the schema already exists.

## No migrate or push

Drizzle does offline DDL generation only. The `dbCredentials.url` in [`packages/db/drizzle.config.ts`](../../packages/db/drizzle.config.ts) is intentionally empty, so raw `drizzle-kit migrate` or `drizzle-kit push` has no connection and must not be used. Apply schema changes only through `db:reset`. The DB test lanes apply migrations the same way, against a Testcontainers Postgres (`scripts/run-db-container-tests.mjs`).

## Postgres vs in-memory

`SIDECHAT_DATABASE_URL` selects the persistence backend at service boot ([`environment.ts:74-79`](../../apps/partner-ai-service/src/config/sidechat-config/environment.ts)):

| State | Development | Production |
| --- | --- | --- |
| URL present | Postgres / Drizzle | Postgres / Drizzle |
| URL absent | In-memory | Hard fail at boot |

In-memory persistence loses all chats on restart. Use it for local development only. See [configuration.md](./configuration.md) for how the URL is declared in `sidechat.config.ts`.

## Three roles

[`runtime-role-grants.sql`](../../packages/db/sql/runtime-role-grants.sql) defines least-privilege roles that `db:reset` applies after the migration. Drizzle manages tables, not roles, so this file is the durable source for the role policy.

| Role | Privileges |
| --- | --- |
| `sidechat_owner` | Owns the schema. |
| `sidechat_migrator` | `USAGE`, `CREATE` on the schema; all privileges on tables (owns DDL). |
| `sidechat_runtime` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` only — never `CREATE`. |

The running service connects as `sidechat_runtime`, so it can read and write rows but cannot alter the schema. Only the migrator role applies DDL.
