# Side Chat repository quality gates

This reference captures the project-specific checks discovered from the uploaded repo. Prefer these checks over generic TypeScript/ESLint advice.

## Package manager and runtime

- npm workspaces only.
- Root package manager: `npm@11.15.0`.
- Node engine: `package.json` `engines.node` is the range `>=24.15.0 <25.0.0` (npm `>=11.12.0 <12.0.0`); `.nvmrc` pins the exact `24.16.0` used for development/CI.
- `.nvmrc` must satisfy the Node engine range.
- `scripts/check-runtime-pins.mjs` fails when the running Node/npm versions do not match the pinned versions.

## Root scripts

```sh
npm run format        # oxfmt . --write
npm run format:check  # oxfmt . --check
npm run lint:oxlint   # oxlint --deny-warnings .
npm run lint:custom   # node scripts/run-custom-lints.mjs
npm run lint          # oxlint + custom lint
npm run typecheck     # tsc --noEmit --pretty false -p tsconfig.check.json
npm test              # vitest run
npm run build         # tsc -b --pretty false
npm run verify        # format:check + oxlint + typecheck + test + build + custom lint
npm run test:e2e      # Playwright lane
npm run test:db:local # DB container lane
```

Use narrower package test scripts while editing. Use `npm run verify` for final confidence when package boundaries, public APIs, generated artifacts, shared types, or runtime/widget behavior changed.

## Formatting

The repo uses `oxfmt`, not Prettier. `.oxfmtrc.json` ignores `.agents/**`.

Do not introduce Prettier formatting rules. Respect the formatter output.

## Oxlint

The repo uses `.oxlintrc.json` with plugins:

- `typescript`
- `import`
- `react`
- `vitest`
- `unicorn`

Important rules:

- `complexity: ["error", 12]`
- `max-depth: ["error", 4]`
- `max-params: ["error", 6]`
- `import/no-cycle: error`
- `no-nested-ternary: error`
- `no-duplicate-imports: error`
- `preserve-caught-error: error`
- `react/rules-of-hooks: error`
- `react/exhaustive-deps: error`
- `typescript/no-explicit-any: error`
- `typescript/no-unsafe-*` family: error
- `typescript/switch-exhaustiveness-check: error`
- `typescript/consistent-type-imports: type-imports`
- `vitest/no-disabled-tests` and `vitest/no-focused-tests`: error

Tests and scripts have some unsafe TypeScript rules disabled. Do not copy those looser allowances into production source.

## TypeScript strictness

`tsconfig.base.json` requires:

- `strict: true`
- `exactOptionalPropertyTypes: true`
- `noUncheckedIndexedAccess: true`
- `noImplicitOverride: true`
- `noImplicitReturns: true`
- `noFallthroughCasesInSwitch: true`
- `noPropertyAccessFromIndexSignature: true`
- `useUnknownInCatchVariables: true`
- `isolatedModules: true`
- `verbatimModuleSyntax: true`

Workspace `tsconfig.json` files must enable composite project references. Root `tsconfig.json` must reference every workspace package.

## Custom governance checks

`npm run lint:custom` runs these 15 scripts in order:

1. `check-runtime-pins.mjs`
2. `check-version-pins.mjs`
3. `check-dependency-policy.mjs`
4. `check-unused-dependencies.mjs`
5. `check-package-exports.mjs`
6. `check-boundaries.mjs`
7. `check-widget-layers.mjs`
8. `check-runtime-boundaries.mjs`
9. `check-outbound-rules.mjs`
10. `check-undefined-optional-contracts.mjs`
11. `check-code-shape.mjs`
12. `check-source-governance.mjs`
13. `check-human-readability.mjs`
14. `check-generated-artifacts.mjs`
15. `check-governance-fixtures.mjs`

## Code shape budgets

From `scripts/check-code-shape.mjs`:

- cognitive complexity max: 12
- production function-like blocks per file max: 28
- production files per directory max: 5
- nested functions max: 8
- `*.test-support.*` files must live under `src/testing/**`

Per-file shape budgets are skipped for copied AI UI primitives under
`packages/side-chat-widget/src/shared/ai/` (the `COPIED_SHARED_AI_PREFIX`),
which are quarantined vendor-style source governed by a directory budget instead.

Known directory budget exceptions (`directoryBudgetExceptions`):

- `packages/side-chat-widget/src/shared/ui` allows 43 files: shared UI primitive catalog keeps direct `#shared/ui/<component>` imports stable, plus a co-located test for the conversation item's running indicator.
- `packages/side-chat-widget/src/shared/ai` allows 12 files: copied AI UI primitives are quarantined vendor-style source.
- `apps/partner-ai-service/src/composition/factories` allows 22 files: service composition factory catalog (one factory plus its co-located test per bundle), kept flat so the composition root reads as a table of contents.
- `packages/db/src/repositories/postgres-drizzle/records` allows 9 files: turn record work split by responsibility (turn-events, turn-lookups, turn-lease, usage) so `turns.ts` stays within budget.
- `packages/db/src/repositories/memory/records` allows 8 files: the memory adapter mirrors the postgres records split (turn-events, turn-lookups, turn-lease) so `turns.ts` stays within budget.

## Source governance budgets

From `scripts/check-source-governance.mjs`:

- production source file max: 300 lines
- test source file max: 450 lines
- unsafe double assertion `as unknown as` is forbidden in production source
- local `class ToolLoopAgent` is forbidden because it shadows the AI SDK export
- generated build/test artifacts must not be tracked

Line budget exceptions (`sourceLineBudgetExceptions`):

- `packages/db/src/drizzle/schema.ts`
- `packages/db/src/schema-contract/repositories.ts`

(Copied AI UI primitives under `packages/side-chat-widget/src/shared/ai/` are also
exempt from the line budget via the `COPIED_SHARED_AI_PREFIX` skip, not this set.)

Exceptions are not invitations to add more complexity. Treat them as legacy/third-party-derived areas to improve carefully.

## Boundary checks

`check-boundaries.mjs` and `check-runtime-boundaries.mjs` enforce package ownership:

- AI SDK imports are owned by `packages/agent-runtime`, except the widget `shared/ai` area may import the `ai` package only for UI component usage.
- Hono imports are owned by `apps/partner-ai-service`.
- pg/Drizzle imports are owned by `packages/db`.
- `process.env` reads belong in `apps/partner-ai-service/src/config/` for production source.
- Cross-package relative imports are forbidden; use package imports.
- Relative imports must not cross top-level `src` folders inside a package; use package-private aliases such as `#runtime/...` or `#features/...`.
- Production source must not import `packages/testing` except inside `packages/testing`.

## Widget layer checks

The widget uses Feature-Sliced Design-style layers:

```txt
app -> widgets -> features -> entities -> shared
```

Rules:

- source must live under `app`, `widgets`, `features`, `entities`, or `shared`;
- obsolete top-level folders `application`, `assets`, `domain`, and `ui` are forbidden;
- higher layers may import lower layers, not the reverse;
- same-level slices must not import other slices;
- `entities/<slice>` may import only itself or shared;
- `shared` must not import product packages or higher widget layers;
- public widget entrypoint may only export the side-chat widget API.

## Dependency policy

`check-dependency-policy.mjs` allowlists dependencies per package and forbids `shadcn` / `@repo/shadcn-ui`. Do not add dependencies unless the allowlist and architecture docs agree.

## Outbound calls

`fetch`, `new WebSocket`, and `new EventSource` are allowed only in approved outbound/provider adapter folders or the existing prompt input exception. Hidden network calls in ordinary code are governance failures.
