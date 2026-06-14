# Verification

Read this when: you need to choose or report verification commands.
Source of truth for: local gates, scenario lanes, and what each command proves.
Not source of truth for: test fixture design or product requirements.

## Local Gate

| Command                | Proves                                    |
| ---------------------- | ----------------------------------------- |
| `npm run format:check` | Oxfmt would not rewrite tracked files.    |
| `npm run lint:oxlint`  | Oxlint and TypeScript-aware rules pass.   |
| `npm run typecheck`    | Strict TypeScript compile contracts hold. |
| `npm test`             | Deterministic Vitest scenarios pass.      |
| `npm run build`        | Project references build.                 |
| `npm run lint:custom`  | Side Chat custom governance passes.       |
| `npm run verify`       | Full local gate passes in project order.  |

Use the pinned runtime when the shell is not already on Node `24.16.0` and npm
`11.15.0`:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Custom Governance

| Script                          | Catches                                         |
| ------------------------------- | ----------------------------------------------- |
| `check-runtime-pins.mjs`        | Node/npm version drift.                         |
| `check-version-pins.mjs`        | Dependency version ranges.                      |
| `check-dependency-policy.mjs`   | Disallowed dependencies.                        |
| `check-unused-dependencies.mjs` | Declared but unused packages.                   |
| `check-package-exports.mjs`     | Package export contract drift.                  |
| `check-boundaries.mjs`          | Cross-package and forbidden imports.            |
| `check-widget-layers.mjs`       | FSD layer violations.                           |
| `check-runtime-boundaries.mjs`  | Runtime/provider/framework ownership leaks.     |
| `check-outbound-rules.mjs`      | Unexpected outbound network calls.              |
| `check-code-shape.mjs`          | Hard code-shape budgets.                        |
| `check-source-governance.mjs`   | Source placement, TS policy, artifacts.         |
| `check-human-readability.mjs`   | Obvious docs/code/comment readability failures. |
| `check-generated-artifacts.mjs` | Generated schema/OpenAPI drift.                 |
| `check-governance-fixtures.mjs` | Governance scripts fail known-bad fixtures.     |

## Scenario Lanes

| Lane             | Command                         | Use when                                             |
| ---------------- | ------------------------------- | ---------------------------------------------------- |
| Unit/service     | `npm test`                      | Most code changes.                                   |
| Adoption flow    | `npm test`                      | Cross-package adopter golden path.                   |
| DB contract      | `npm run test:db:container`     | Persistence/schema/repository changes.               |
| Widget browser   | `npm run test:e2e`              | Browser-visible widget behavior changes.             |
| Persistent E2E   | `npm run test:e2e:persistent`   | Service plus DB plus widget integration changes.     |
| Provider smoke   | `npm run smoke:provider:openai` | Explicit provider smoke with configured credentials. |
| Container parity | `npm run verify:container`      | Release/CI parity checks.                            |

## Reporting Failures

If a command cannot run, report:

```txt
command:
why not run:
what would be needed:
risk:
```
