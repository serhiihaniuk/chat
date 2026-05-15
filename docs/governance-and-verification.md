# Governance and verification

This project uses lightweight repository governance to protect the side-chat PRD boundaries while implementation continues.

## Boundary constraints

`npm run lint` executes `scripts/governance-check.mjs` and should remain part of every final verification pass. It currently checks:

- exact dependency pins for the approved stack;
- no prohibited prototype naming in source/docs/package metadata;
- Hono imports stay inside the API inbound adapter;
- AI SDK imports stay inside the API AI adapter boundary;
- `pg` imports stay inside `packages/db`;
- `packages/shared-protocol` remains framework/runtime independent;
- `packages/db` does not import React, Hono, or AI SDK packages;
- copied AI Elements code does not depend on Next.js aliases or AI SDK React hooks;
- required Postgres stored-procedure names and direct table-grant revocation exist.

## Verification order

Use `corepack pnpm install` first in a fresh worktree, then use this order for final evidence when the implementation lanes are ready:

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

`npm test` follows the root Vitest include pattern (`packages/**/*.test.ts` and `apps/**/*.test.ts`), including the DB stored-procedure protocol regression at `packages/db/tests/db-protocol.test.ts`.

If e2e fails because required browser binaries are missing, install Playwright browsers in the local environment and rerun. If e2e fails because ports are occupied, identify and stop only the process that belongs to this repo before rerunning. Playwright is configured to reuse existing servers, so preflight ports before treating e2e as fresh evidence.

## Dev-server cleanup evidence

Final reports should include all of the following:

```sh
git status --short
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
lsof -nP -iTCP:5432 -sTCP:LISTEN
docker compose ps
```

Expected final state is a clean or intentionally documented git status, no repo-owned listeners left on ports `3000`, `5173`, or `5432`, and no unexpected Compose services left running. A listener owned by another project is a blocker to e2e reliability and should be reported rather than killed blindly.

## PRD-specific open checks

Before marking the full app complete, confirm these are true in the integrated branch:

- Docker Compose uses the PRD Postgres major version.
- Docker Compose starts cleanly from the checked-in install command and supports the current workspace package specs.
- deterministic seed data is split into `docker/postgres/init/002_seed.sql`;
- API runtime uses the DB-backed repository/usage path when `DATABASE_URL` is present while preserving deterministic fake/in-memory paths for tests;
- widget UI exposes seeded history and retry/error recovery states;
- final verification commands above pass from a fresh workspace install;
- Docker smoke verifies `/health`, `/chat/history`, and `/chat/stream` with the Compose-provided Postgres/API path before cleanup.
