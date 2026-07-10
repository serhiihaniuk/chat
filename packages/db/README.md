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
  `renewTurnLease` / `reapExpiredTurns`. Every service instance runs the turn
  reaper, which claims expired turns in bounded, disjoint batches.
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

## Adding an entity

A new persisted entity crosses every layer of this package, and two gates fail the build until the layers agree: the `SCHEMA_ENTITY_TYPES` governance test and the shared contract suite both adapters run. Follow the layers in order — `usage_record` is the smallest end-to-end example to copy.

1. **Declare the contract** (`src/schema-contract/`). Add the record type in [`entities.ts`](src/schema-contract/entities.ts) (extend `TenantScopedRecord & VersionedRecord` so `workspaceId`, `createdAt`, and `updatedAt` are required) and add it to the `SchemaContractRecord` union. Add the command type(s) in [`repositories.ts`](src/schema-contract/repositories.ts) (extend `RepositoryCommandEnvelope` so `workspaceId` + `now` are required; results are `RepositoryCommandResult<YourRecord>`) and the method signatures on the fitting contract interface — `ConversationRepositoryContract`, `AssistantTurnRepositoryContract`, or `InteractionRepositoryContract`. Add a branded id + its `to<Id>` helper in [`ids/persistence-ids.ts`](src/schema-contract/ids/persistence-ids.ts). If the entity has a state machine, add its status tuple in [`lifecycle.ts`](src/schema-contract/lifecycle.ts).
2. **Register the entity name** (`src/schema-contract/lifecycle.ts`). Append the entity's string to `SCHEMA_ENTITY_TYPES`, then add the same string to the expected array in [`schema-contract.test.ts`](src/schema-contract/schema-contract.test.ts) ("names the required persisted entity surfaces"). This test fails first if you skip it — it is the drift guard that forces every layer below.
3. **Define the table** (`src/drizzle/schema.ts`). Add the `sidechat.table(...)` definition (columns mirror the record; use `check()` for status enums) and register it in the `sidechatTables` object at the bottom of the file.
4. **Implement both adapters, in parity.** Add the row→record mapper `to<Entity>Record` in [`postgres-drizzle/records/records.ts`](src/repositories/postgres-drizzle/records/records.ts). Add the Postgres operations to the fitting grouped file under [`postgres-drizzle/records/`](src/repositories/postgres-drizzle/records) (`usage.ts`, `interactions.ts`, `turns.ts`, …) and mirror them under [`memory/records/`](src/repositories/memory/records), plus a store array in [`memory/store/store.ts`](src/repositories/memory/store/store.ts). Wire each factory into [`postgres-drizzle/index.ts`](src/repositories/postgres-drizzle/index.ts) and [`memory/index.ts`](src/repositories/memory/index.ts). Prefer extending a grouped file over adding one: these `records/` dirs carry a raised file budget (Postgres 9, memory 8), not the usual 5.
5. **Prove parity** (`src/testing/repository-contract.test-support.ts`). Add cases for idempotency, any lifecycle transitions, and cross-workspace isolation. Both adapters run this one suite, so a memory/Postgres divergence fails here rather than in production.
6. **Regenerate the migration.** Rebuild the package first — `npm run build --workspace @side-chat/db` — then `npm run db:generate`. Gotcha: `db:generate` resolves `#schema-contract` through `packages/db/dist/`, so a stale build silently regenerates the migration against the old types. Rebuild, generate, then confirm the new table appears in `packages/db/migrations/`.

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
