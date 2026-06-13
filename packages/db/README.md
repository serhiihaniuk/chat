# db

Read this when: editing schema, repositories, migrations, or persistence test
contracts.
Source of truth for: this package's ownership, public surface, and local
boundaries.
Not source of truth for: product workflow or protocol events.

## Owns

- Drizzle/Postgres schema and adapters.
- Repository contracts and memory repositories for tests/local development.
- Persistence integration tests and schema governance.

## Does Not Own

- Product policy or use cases.
- Hono routes.
- Agent runtime execution.
- Widget state.

## Public Surface

Repository interfaces, adapter factories, schema exports, and test helpers where
explicitly exported.

## Main Flows

```txt
product/service port call -> repository adapter -> persistence record
```

## Boundary Rules

- Drizzle and Postgres stay inside this package.
- Memory repositories are explicit test/local paths, not silent production
  fallback.
- Do not import Hono, React, widget code, agent runtime internals, or partner
  core use cases.

## Tests

- Repository contract tests under `src`.
- Container tests through `npm run test:db:container`.

## Related Docs

- `docs/architecture/package-map.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/testing-and-verification.md`
