# db

Read this when: editing Side Chat schema, repositories, migrations, or Workflow journal maintenance.
Source of truth for: this package's persistence ownership, public surface, and local boundaries.
Not source of truth for: product workflow, HTTP routes, or protocol events.

## Owns

- The `sidechat` Postgres schema for conversations, complete AI SDK UI-message parts, and assistant turns.
- Tenant-scoped, idempotent repository operations for message append, turn admission, run binding, and terminal projection.
- The Postgres Workflow journal maintenance adapter. It validates the six-table schema pinned by `@workflow/world-postgres`, selects only old terminal runs bound to terminal Side Chat turns, excludes legal holds, optionally archives a complete run snapshot, and deletes child rows before the run in one transaction.
- Drizzle schema generation, Postgres repository integration tests, and disposable-container verification.

The package does not own product policy, Hono routes, Workflow execution, provider behavior, or widget state. It keeps `pg` and `drizzle-orm` behind the persistence boundary.

## Public surface

`createPostgresDrizzleSidechatRepositories` exposes the product repositories. `createPostgresWorkflowJournalMaintenance` exposes schema validation, one bounded sweep, and cleanup. Archive callbacks are idempotent by `runId` because a transaction can roll back after an external archive succeeds.

Repository consumers depend on the structural method contract. The package does
not publish an adapter discriminator or promise hypothetical custom adapters;
composition already knows which concrete factory it selected.

Production persistence has no memory fallback. The in-memory service adapter is an explicit local/test substitute rather than a second database implementation.

## Main flows

```txt
service persistence port -> Postgres repository -> sidechat row
maintenance scheduler -> advisory-locked transaction -> eligibility + legal hold check
record-class run -> complete six-table archive -> child-first journal deletion
```

The maintenance connection must reach the same physical database as the product connection so its transaction can join `workflow.workflow_runs` to `sidechat.assistant_turns` and `sidechat.conversations`. Separate least-privilege database users are allowed when both point to that database and the maintenance user can read the Side Chat eligibility columns.

## Tooling and tests

- `npm run db:generate` regenerates the single pre-alpha Drizzle migration.
- `npm run db:reset` rebuilds the disposable/local `sidechat` schema.
- `npm run test:db:container` bootstraps both the Side Chat migration and the installed Postgres World migration, then runs repository and maintenance integration tests.
- Least-privilege Side Chat grants live in `packages/db/sql/runtime-role-grants.sql`.

Canonical operational details live in [`docs/operations/database.md`](../../docs/operations/database.md); package and dependency rules live in [`docs/architecture/package-boundaries.md`](../../docs/architecture/package-boundaries.md).
