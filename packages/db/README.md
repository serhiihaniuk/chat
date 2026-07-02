# db

Read this when: editing schema, repositories, migrations, or persistence test
contracts.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product workflow or protocol events.

## Owns

- The Postgres schema and repositories for durable chat state: conversations,
  user/assistant messages, assistant-turn records and statuses, usage records,
  context snapshots, and audit events.
- Turn-record lifecycle operations: idempotent turn start on
  `(workspace_id, request_id)`, running-guarded complete/fail transitions,
  cancel intent (`requestTurnCancellation` CAS + `pg_notify` in one
  transaction), and the compare-and-set lease operations `acquireTurnLease` /
  `renewTurnLease` / `reapExpiredTurns` (note: no production caller sweeps
  expired leases yet — `plan/05`).
- Postgres `LISTEN/NOTIFY` for the two small signal channels, `turn_cancel` and
  `turn_activity` — pokes carrying ids, never event bodies. A dedicated
  `LISTEN` connection per channel, opened outside the query pool, bridges
  notifications into the service through the
  `createPostgresTurn{Cancel,Activity}NotificationSource` factories (with NOOP
  variants for memory/local paths). Live turn _events_ do not flow through this
  package — they live in the service's in-memory registry
  ([ADR 0007](../../docs/adr/0007-connection-bound-streaming.md)).
- Drizzle/Postgres schema, the postgres-drizzle adapter, and memory
  repositories for tests/local development, kept in parity by shared contract
  test suites.
- Persistence integration tests and schema governance.

## Does Not Own

- Product policy or use cases.
- Hono routes.
- Agent runtime execution.
- Widget state.
- The live turn-event stream (service-owned, in-memory).

## Public Surface

Repository contracts (see `src/schema-contract/repositories.ts`, including
`AssistantTurnRepositoryContract`), the adapter factories
`createPostgresDrizzleSidechatRepositories` and `createMemorySidechatRepositories`,
the notification-source factories and their NOOP variants (`src/repositories/index.ts`),
schema exports, and test helpers where explicitly exported. Channel constants live in
`src/schema-contract/lifecycle.ts`.

## Main Flows

```txt
service port call -> repository adapter -> persistence record
status transition (cancel/complete/fail) -> pg_notify in the same transaction
LISTEN connection -> notification source -> service dispatcher fan-out
```

## Boundary Rules

- Drizzle and Postgres stay inside this package.
- Use `shared` for JSON primitives and optional field helpers; persistence code
  must not import browser protocol types for generic JSON.
- Memory repositories are explicit test/local paths, not silent production
  fallback.
- Do not import Hono, React, widget code, agent runtime internals, or partner
  core use cases.

## Tooling

- `npm run db:generate` regenerates the single Drizzle migration from `schema.ts`.
- `npm run db:reset` rebuilds the local database.
- Least-privilege runtime grants live in `packages/db/sql/runtime-role-grants.sql`,
  applied after migrations.

## Tests

- Repository contract tests under `src`, run against both adapters.
- Container tests through `npm run test:db:container`.

## Canonical Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/system-map.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
