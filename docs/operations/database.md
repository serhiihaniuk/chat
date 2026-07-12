# Database Tooling

Read this when: you change the schema, rebuild a local Postgres, or wonder why there is no migration history.
Source of truth for: the `db:generate` and `db:reset` workflow, the day-one migration convention, and the three Postgres roles.
Not source of truth for: how `SIDECHAT_DATABASE_URL` is declared or resolved — see [configuration.md](./configuration.md).

Side Chat persists chats in a Postgres schema named `sidechat`. Drizzle generates the table DDL offline; it never touches a live database. You apply that DDL with one command, `db:reset`, which drops and rebuilds the schema from scratch. There is no incremental migration chain and no `drizzle-kit migrate`/`push` path — the schema is always regenerated whole from `packages/db/src/drizzle/schema.ts`.

## Two commands

Run both from the repo root. Edit `packages/db/src/drizzle/schema.ts`, then:

| Command               | Does                                                                                                                     | Entry point                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `npm run db:generate` | Wipes `packages/db/migrations`, then emits exactly one migration named `day_one` from `schema.ts`.                       | [`scripts/db-generate.mjs`](../../scripts/db-generate.mjs)       |
| `npm run db:reset`    | Resolves the connection, then drops the `sidechat` schema, recreates it, applies the migration, and applies role grants. | [`scripts/reset-database.mjs`](../../scripts/reset-database.mjs) |

`db:generate` produces DDL files; it does not connect to Postgres. `db:reset` is the only path that touches a database.

## The day-one convention

`db:generate` regenerates the whole schema, not a delta. It runs `rm -rf packages/db/migrations`, then `drizzle-kit generate --name day_one` ([`scripts/db-generate.mjs:11-16`](../../scripts/db-generate.mjs)). Every schema change replaces the single `day_one` migration. Do not expect an incremental journal chain or a numbered migration history to review.

## What db:reset does

`db:reset` resolves `SIDECHAT_DATABASE_URL` through the service, then rebuilds the schema from a clean state. The resolve and apply split across two files:

1. **Resolve.** [`scripts/reset-database.mjs`](../../scripts/reset-database.mjs) reads `SIDECHAT_DATABASE_URL` directly from the environment and exits with an error if it is unset. The reset entry is standalone — it does not import a service — so rebuilding a local database never depends on either app compiling.
2. **Apply.** `applySidechatSchema` runs four steps in order ([`scripts/lib/apply-sidechat-schema.mjs:28-33`](../../scripts/lib/apply-sidechat-schema.mjs)):

| Step    | SQL                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------- |
| Drop    | `DROP SCHEMA IF EXISTS sidechat CASCADE`                                                          |
| Create  | `CREATE SCHEMA "sidechat"`                                                                        |
| Migrate | Apply every generated migration in journal order.                                                 |
| Grant   | Apply [`packages/db/sql/runtime-role-grants.sql`](../../packages/db/sql/runtime-role-grants.sql). |

The apply layer creates the schema itself because the generated migration assumes the schema already exists.

## No migrate or push

Drizzle does offline DDL generation only. The `dbCredentials.url` in [`packages/db/drizzle.config.ts`](../../packages/db/drizzle.config.ts) is intentionally empty, so raw `drizzle-kit migrate` or `drizzle-kit push` has no connection and must not be used. Apply schema changes only through `db:reset`. The DB test lanes apply migrations the same way, against a Testcontainers Postgres (`scripts/run-db-container-tests.mjs`).

## Graduating to incremental migrations

The day-one convention exists because regenerating the whole schema is safe only while you can drop the database at will. The moment you run a deployed instance with data you cannot lose, `db:reset`'s `DROP SCHEMA … CASCADE` stops being acceptable and you must switch to a forward-only migration chain. This is the intended graduation path, not a path the repo exercises today — plan it before your first production data, not after.

Switch in four steps:

1. **Stop regenerating.** Stop running `npm run db:generate`. Its whole job is the day-one wipe — `rm -rf packages/db/migrations` then `drizzle-kit generate --name day_one` — which throws away migration history. Freeze the current `packages/db/migrations` as your baseline, and commit it as history you never rewrite.
2. **Generate deltas, not the whole.** Edit `schema.ts`, then run `drizzle-kit generate` directly (no `rm -rf`, a real `--name <change>` per change) so each edit stacks a new numbered migration on the baseline instead of replacing it.
3. **Apply forward-only.** Populate `dbCredentials.url` in [`drizzle.config.ts`](../../packages/db/drizzle.config.ts) and apply with `drizzle-kit migrate`, which runs only the not-yet-applied migrations against the live database. Do not use `db:reset` against data you keep.
4. **Retire the destructive reset.** Keep `db:reset` for local development and ephemeral test databases only — its `DROP SCHEMA … CASCADE` erases everything. Never point it at a database whose data must survive.

The role model already fits this future: `sidechat_migrator` owns DDL and `sidechat_runtime` cannot alter the schema (see [Least-privilege roles](#least-privilege-roles)), so incremental migrations run as the migrator while the service keeps its least-privilege runtime connection.

## Postgres vs in-memory

`SIDECHAT_DATABASE_URL` selects the persistence backend at service boot. In the v7 service it is the `persistence.databaseUrl` config field (declared in the `sidechat*.config.ts` variants); production composition builds the Postgres turn store when it is set and the in-memory store when it is absent:

| State       | Development        | Production         |
| ----------- | ------------------ | ------------------ |
| URL present | Postgres / Drizzle | Postgres / Drizzle |
| URL absent  | In-memory          | Hard fail at boot  |

In-memory persistence loses all chats on restart. Use it for local development only. See [configuration.md](./configuration.md) for how the URL is declared in `sidechat.config.ts`.

## Client-tool coordination

`sidechat.client_tool_dispatches` is the authority for browser-executed tool calls. One row is unique on `(assistant_turn_id, tool_call_id)` and moves atomically from `dispatched` to `settled`, `failed`, `timed_out`, or `aborted`; a result after timeout records `late` without replacing the timeout output already returned to the model. The exact JSON-safe model output is stored in an object envelope so JSON `null` remains distinguishable from SQL `NULL`. Inputs are not copied into this coordination table.

`assistant_turns.run_id` has a partial unique index and is bound once. Result routes first resolve that run under the authenticated workspace and subject, then require the exact dispatch row before accepting a body. This makes the row an anti-spoof anchor and lets any service instance settle a suspended Workflow run without relying on process memory.

## Tool-approval coordination

`sidechat.tool_approvals` is the durable authority for gated server-tool execution. One row is unique on `(assistant_turn_id, tool_call_id)` and records the approval id, tool name, canonical input digest, request and expiry timestamps, terminal decision, optional reason, and approver identity. Raw tool input is deliberately absent: the digest binds the approval to the journaled call without duplicating private payloads.

The state machine is `requested -> approved | denied | expired`. Request replay must preserve approval id, tool identity, digest, and expiry. An exact repeated decision is idempotent; a changed reason, opposite decision, late decision, identity mismatch, or decision after the turn becomes terminal is rejected. State transitions and their `audit_events` row commit in one transaction, and concurrent conflicting decisions serialize on the approval row.

The authenticated decision route resolves `assistant_turns.run_id` under workspace and subject ownership before reading its body. The workflow persists the request before emitting `tool-approval-request`, then reloads the durable row after its deterministic hook wakes. Only an approved row can enter the idempotent execution step, which reloads the current tool catalog and revalidates schema and policy.

## Workflow journal maintenance

Production uses two schemas in one physical database: `sidechat` is the durable business record and `workflow` is the Postgres World execution journal. `SIDECHAT_DATABASE_URL` and `WORKFLOW_POSTGRES_URL` may use different least-privilege users, but their host, port, and database must match so one maintenance transaction can enforce Side Chat legal holds.

`journalPruneAfterDays`, `journalSweepIntervalMs`, and `journalClass` are declared in the service's `workflow` config block. The service validates the exact six-table World schema at boot, performs an immediate catch-up sweep, and repeats on the configured interval. A transaction-scoped advisory lock prevents overlapping instances; transient sweep failures are recorded and the next interval retries.

Only Workflow-terminal runs older than the cutoff and bound to terminal Side Chat turns are eligible. Conversations under legal hold are excluded. The default `operational` class deletes eligible hot-journal rows; the `record` class requires an injected archive callback and archives a complete six-table snapshot before deletion. Archive storage must make `runId` idempotent because a later database rollback can cause a retry.

`npm run test:db:container` applies the Side Chat migration, runs the installed `@workflow/world-postgres` bootstrap, and proves the adapter against that real pinned schema. The maintenance principal needs DML on the six `workflow` tables plus `SELECT` on the Side Chat turn and conversation eligibility columns; the `sidechat_maintenance` role in [`runtime-role-grants.sql`](../../packages/db/sql/runtime-role-grants.sql) grants that `SELECT` on `sidechat.assistant_turns` and `sidechat.conversations`. Schema bootstrap remains a migrator/owner action.

## Least-privilege roles

[`runtime-role-grants.sql`](../../packages/db/sql/runtime-role-grants.sql) defines least-privilege roles that `db:reset` applies after the migration. Drizzle manages tables, not roles, so this file is the durable source for the role policy.

| Role                   | Privileges                                                                     |
| ---------------------- | ------------------------------------------------------------------------------ |
| `sidechat_owner`       | Owns the schema.                                                               |
| `sidechat_migrator`    | `USAGE`, `CREATE` on the schema; all privileges on tables (owns DDL).          |
| `sidechat_runtime`     | `SELECT`, `INSERT`, `UPDATE`, `DELETE` only — never `CREATE`.                  |
| `sidechat_maintenance` | `USAGE` on the schema; `SELECT` on `assistant_turns` and `conversations` only. |

The running service connects as `sidechat_runtime`, so it can read and write rows but cannot alter the schema. The Workflow journal sweep connects as `sidechat_maintenance` (see [Workflow journal maintenance](#workflow-journal-maintenance)) — it reads turn and conversation eligibility but cannot touch any other Side Chat data. Only the migrator role applies DDL.
