# Verification

Read this when: you need to choose, run, or report a verification command.
Source of truth for: the root `package.json` gate commands and what each proves.
Not source of truth for: test fixture design (see [packages/testing/README.md](../../packages/testing/README.md)) or product requirements.

Side Chat gates every change through scripts in the root `package.json`. The one
command you run before pushing is `npm run verify`: it chains six checks and fails
on the first one. Most lanes need no Docker; a few (container, persistent E2E)
do. This doc lists every command, what it proves, and the run order of the
custom governance gates.

## The one command

`npm run verify` runs these six steps in order, stopping at the first failure
(`package.json:29`):

1. `format:check`
2. `lint:oxlint`
3. `typecheck`
4. `test`
5. `build`
6. `lint:custom`

Note the order: `lint:custom` (the governance gates) runs **last, after
`build`** — not next to `lint:oxlint`. A green Oxlint tells you nothing about
governance until the final step passes.

For a reproducible run pinned to the fixture runtime:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Command reference

Every command below is a root `package.json` script (`package.json:11-31`).

| Command                    | What it proves                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `npm run format:check`     | Oxfmt would not rewrite any tracked file.                                                                |
| `npm run lint:oxlint`      | Oxlint and TypeScript-aware rules pass; warnings fail.                                                   |
| `npm run lint:custom`      | The 14 custom governance gates pass (see below).                                                         |
| `npm run lint`             | Both lint layers pass: Oxlint, then custom gates.                                                        |
| `npm run typecheck`        | Strict TypeScript compiles with no emit.                                                                 |
| `npm run build`            | The project-reference build (`tsc -b`) succeeds.                                                         |
| `npm test`                 | Deterministic Vitest scenarios (unit, service, adoption) pass.                                           |
| `npm run verify`           | The full local gate passes in order; `lint:custom` runs last.                                            |
| `npm run verify:container` | CI parity: `verify` + `test:db:container` + `test:e2e:persistent` pass inside the dev-test Docker image. |

### Database lanes

| Command                       | What it proves                                                                      | Needs Docker                    |
| ----------------------------- | ----------------------------------------------------------------------------------- | ------------------------------- |
| `npm run test:db:integration` | The Postgres/Drizzle repository test passes against `SIDECHAT_TEST_DATABASE_URL`.   | No (bring your own DB)          |
| `npm run test:db:container`   | A Testcontainers Postgres boots, migrations apply, and the integration test passes. | Yes                             |
| `npm run test:db:local`       | Alias of `test:db:container`.                                                       | Yes                             |
| `npm run db:generate`         | Regenerates the single fresh migration from `schema.ts`.                            | No                              |
| `npm run db:reset`            | Drops and rebuilds the `sidechat` schema from migrations plus role grants.          | No (needs a reachable Postgres) |

### Browser, smoke, and audit lanes

| Command                         | What it proves                                                                       | Needs Docker |
| ------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| `npm run test:e2e`              | Playwright drives the widget in a browser (direct page and iframe host).             | No           |
| `npm run test:e2e:persistent`   | History survives a service restart, with the service plus a Testcontainers Postgres. | Yes          |
| `npm run smoke:provider:openai` | A live OpenAI run streams end to end on the connection-bound POST.                   | No           |
| `npm run audit`                 | `npm audit` reports no high-or-above advisory.                                       | No           |

The provider smoke refuses to run until you set **both** acknowledgement flags:
`SIDECHAT_OPENAI_API_KEY` and `SIDECHAT_LIVE_PROVIDER_SMOKE=approved`
(`scripts/smoke-openai-provider.mjs:5-12`).

## Custom governance gates

`npm run lint:custom` runs `scripts/run-custom-lints.mjs`, which executes 14 gates
in the fixed order below (`run-custom-lints.mjs:7-22`). The first non-zero exit
aborts the run and prints a per-gate repair prompt (`run-custom-lints.mjs:24-37`).
Run them in this order:

| #   | Gate                                     | Enforces                                                                                                                                                        |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `check-version-pins.mjs`                 | A lockfile exists and every dependency uses an exact, pinned version.                                                                                           |
| 2   | `check-dependency-policy.mjs`            | Each package declares only allowlisted deps and never a forbidden UI package.                                                                                   |
| 3   | `check-unused-dependencies.mjs`          | Every declared dependency is actually imported in that package.                                                                                                 |
| 4   | `check-package-exports.mjs`              | Each workspace `package.json` matches the scoped, private, ESM export contract.                                                                                 |
| 5   | `check-boundaries.mjs`                   | Per-area forbidden imports and cross-package relative imports stay out.                                                                                         |
| 6   | `check-widget-layers.mjs`                | The widget honours its Feature-Sliced Design layering.                                                                                                          |
| 7   | `check-runtime-boundaries.mjs`           | `pg`/`drizzle` stay in `db`, `hono` in the service, `ai`/`@ai-sdk/*` in `agent-runtime`, and `process.env` reads only in tests or the service config adapter.   |
| 8   | `check-outbound-rules.mjs`               | Outbound calls (`fetch`, `WebSocket`, `EventSource`) live only in approved files.                                                                               |
| 9   | `check-undefined-optional-contracts.mjs` | Optional-contract anti-patterns stay out: removed `optionalField(`, `\|\| undefined` coercion, empty-object optional shapes, untyped repository `kind` probing. |
| 10  | `check-code-shape.mjs`                   | AST budgets hold: cognitive complexity, nesting, blocks per file, files per directory.                                                                          |
| 11  | `check-source-governance.mjs`            | Strict TS config, colocated tests, file-size limits, no tracked build output, no `as unknown as`.                                                               |
| 12  | `check-human-readability.mjs`            | Canonical docs exist, each durable `.md` has the required header, and paragraphs stay within the word and character limits.                                     |
| 13  | `check-generated-artifacts.mjs`          | The schema and OpenAPI JSON exist and every `*.generated.*` file declares its source.                                                                           |
| 14  | `check-governance-fixtures.mjs`          | Each gate fails its known-bad fixture, and every on-disk gate is wired into the runner.                                                                         |

Gate 14 is the meta-gate: it proves no gate silently stops running, so add a new
`check-*.mjs` to `run-custom-lints.mjs` or this gate fails.

## Docker vs. no-Docker

Three lanes need a Docker daemon: `verify:container`, `test:db:container` (and its
`test:db:local` alias), and `test:e2e:persistent`. They build images or start
Testcontainers Postgres.

To work without Docker, run the in-memory stack with `node scripts/run-local-fake.mjs`
— see [embed-widget-iframe.md](embed-widget-iframe.md). For day-to-day checks,
`npm run verify` and `npm run test:e2e` need no Docker at all.

## Supported runtimes

| Tool | Range               | Pinned fixture               |
| ---- | ------------------- | ---------------------------- |
| Node | `>=24.15.0 <25.0.0` | `24.16.0` (`.nvmrc`)         |
| npm  | `>=11.12.0 <12.0.0` | `11.15.0` (`packageManager`) |

The engine ranges live at `package.json:51-55`. Use the pinned reproducible
command above (`npx -p node@24.16.0 -p npm@11.15.0 npm run verify`) when you need
a run that matches CI exactly.

## Reporting a failure

If a command cannot run, report it in this shape:

```txt
command:
why not run:
what would be needed:
risk:
```
