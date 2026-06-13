# Side Chat repository quality gates

This reference captures the project-specific checks discovered from the uploaded repo. Prefer these checks over generic TypeScript/ESLint advice.

## Package manager and runtime

- npm workspaces only.
- Root package manager: `npm@11.15.0`.
- Node engine: `24.16.0`.
- `.nvmrc` must match the Node engine.
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

`npm run lint:custom` runs these scripts in order:

1. `check-runtime-pins.mjs`
2. `check-version-pins.mjs`
3. `check-dependency-policy.mjs`
4. `check-unused-dependencies.mjs`
5. `check-package-exports.mjs`
6. `check-boundaries.mjs`
7. `check-widget-layers.mjs`
8. `check-runtime-boundaries.mjs`
9. `check-outbound-rules.mjs`
10. `check-code-shape.mjs`
11. `check-source-governance.mjs`
12. `check-generated-artifacts.mjs`
13. `check-governance-fixtures.mjs`

## Code shape budgets

From `scripts/check-code-shape.mjs`:

- cognitive complexity max: 12
- production function-like blocks per file max: 28
- production files per directory max: 12
- nested functions max: 8
- `*.test-support.*` files must live under `src/testing/**`

Known shape budget exceptions:

- `packages/side-chat-widget/src/shared/ai/code-block.tsx`
- `packages/side-chat-widget/src/shared/ai/message.tsx`
- `packages/side-chat-widget/src/shared/ai/prompt-input.tsx`

Known directory budget exception:

- `packages/side-chat-widget/src/shared/ui` allows 20 files because shared UI primitive imports must stay stable.

## Source governance budgets

From `scripts/check-source-governance.mjs`:

- production source file max: 300 lines
- test source file max: 450 lines
- unsafe double assertion `as unknown as` is forbidden in production source
- local `class ToolLoopAgent` is forbidden because it shadows the AI SDK export
- generated build/test artifacts must not be tracked

Line budget exceptions:

- `packages/db/src/drizzle/schema.ts`
- `packages/side-chat-widget/src/shared/ai/code-block.tsx`
- `packages/side-chat-widget/src/shared/ai/message.tsx`
- `packages/side-chat-widget/src/shared/ai/prompt-input.tsx`

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
