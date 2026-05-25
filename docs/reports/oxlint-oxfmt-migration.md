# Oxlint/Oxfmt Migration

Date: 2026-05-25

The root lint and format toolchain now uses OXC tools:

- `npm run format` runs `oxfmt . --write`.
- `npm run format:check` runs `oxfmt . --check`.
- `npm run lint:oxlint` runs `oxlint --deny-warnings .`.
- `npm run lint` runs Oxlint first, then the existing repo-specific governance scripts.
- `npm run verify` keeps the same full local gate shape with Oxfmt, Oxlint, typecheck, tests, build, and custom checks.

The old ESLint and Prettier packages were removed from the root dev dependencies. `eslint.config.js` was deleted after generating `.oxlintrc.json` with `@oxlint/migrate --type-aware`. `oxlint-tsgolint` is pinned because Oxlint 1.66.0 uses it for type-aware rules.

Rule coverage notes:

- Oxlint carried across the repo's local safety rules for TypeScript, import hygiene, React hooks, Vitest focus/disable checks, complexity, nesting, parameters, duplicate imports, restricted imports, debugger/alert bans, and nested ternaries.
- `no-undef` and `no-useless-assignment` were not enabled by the migration because they are nursery rules in Oxlint 1.66.0. TypeScript still owns unresolved identifier checking, and the custom code-quality scripts continue to cover broader drift.
- `no-dupe-args` and `no-octal` were skipped by the migration because strict mode and TypeScript parsing supersede them in this ESM/TS workspace.
- Warning-level lint output is denied by the `--deny-warnings` script flag. The migrated `max-params` and React hook dependency checks are configured as errors.
