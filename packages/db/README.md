# db

Read this when: editing schema, repositories, migrations, or persistence test
contracts.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product workflow or protocol events.

## Owns

- The durable `turn_events` append log behind resumable streaming: `appendTurnEvent`
  guards against writing past a terminal event, fires Postgres `NOTIFY` on commit,
  and reconciles primary-key conflicts idempotently (same `(turn, sequence)` payload
  returns the existing row; a divergent one raises `event_log_conflict`).
- Postgres `LISTEN/NOTIFY` fan-out over channels `turn_events`, `turn_cancel`, and
  `turn_activity` (no Redis). A dedicated `LISTEN` connection per channel, opened
  outside the query pool, bridges notifications into the runtime through the
  `createPostgresTurn{Event,Cancel,Activity}NotificationSource` factories (with NOOP
  variants for memory/local paths).
- The turn-record read/write and lease surface that fences turn ownership across
  instances: `readTurnEventsAfter`, `findActiveAssistantTurn`,
  `listActiveAssistantTurns`, `requestTurnCancellation`, `pruneTurnEventsBefore`, and
  the compare-and-set lease operations `acquireTurnLease` / `renewTurnLease` /
  `reapExpiredTurns`.
- Drizzle/Postgres schema, the postgres-drizzle adapter, and memory repositories for
  tests/local development.
- Persistence integration tests and schema governance.

## Does Not Own

- Product policy or use cases.
- Hono routes.
- Agent runtime execution.
- Widget state.

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
appendTurnEvent (terminal guard, PK reconcile) -> Postgres NOTIFY
LISTEN connection -> notification source -> dispatcher fan-out
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

- Repository contract tests under `src`.
- Container tests through `npm run test:db:container`.

## Canonical Docs

- `docs/domain/vocabulary.md`
- `docs/architecture/system-map.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
