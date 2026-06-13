# Quality Gate Command Map

## While editing one area

Use the narrowest relevant command first:

```sh
npm run format:check
npm run lint:oxlint
npm run typecheck
npm test -- <file-or-pattern-if-supported>
npm test
```

Package scripts also exist, for example:

```sh
npm --workspace @side-chat/agent-runtime test
npm --workspace @side-chat/side-chat-widget test
npm --workspace @side-chat/partner-ai-service typecheck
```

Prefer root commands when package script behavior is unclear.

## Before claiming the branch is ready

```sh
npm run verify
```

If Node/npm mismatch:

```sh
npx -p node@24.16.0 -p npm@11.15.0 npm run verify
```

## Custom lints individually

Run a focused custom lint when its area changed:

```sh
node scripts/check-runtime-pins.mjs
node scripts/check-version-pins.mjs
node scripts/check-dependency-policy.mjs
node scripts/check-unused-dependencies.mjs
node scripts/check-package-exports.mjs
node scripts/check-boundaries.mjs
node scripts/check-widget-layers.mjs
node scripts/check-runtime-boundaries.mjs
node scripts/check-outbound-rules.mjs
node scripts/check-code-shape.mjs
node scripts/check-source-governance.mjs
node scripts/check-generated-artifacts.mjs
node scripts/check-governance-fixtures.mjs
```

## Common blockers

If dependencies are not installed, typecheck, build, Oxlint, Oxfmt, and some custom lints may not run.

If the shell uses Node/npm different from the pins, `check-runtime-pins.mjs` fails. Report that honestly and use the pinned `npx` command when possible.

If `.env` or service dependencies are missing, provider smoke/e2e/integration lanes may be blocked. Do not hide this behind a generic “tests passed.”
