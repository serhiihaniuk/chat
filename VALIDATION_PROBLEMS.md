# Repository Validation Problems

Date: 2026-05-23

Scope: current dirty worktree in `/Users/shaniuk/Desktop/bucket/chat`, validated against `docs/architecture/production-system-design.md`.

## Current Status

The alignment pass has been applied. The implementation now uses the production package vocabulary, enforces the current boundary rules, routes protected HTTP work through Hono auth middleware, exposes an Agent/ToolLoopAgent-shaped runtime boundary, splits the Partner AI service HTTP adapter by responsibility, and adds an explicit Postgres integration lane.

The local host runtime remains Node `24.14.0` / npm `11.9.0`, but the pinned runtime was executed ephemerally with `npx -p node@24.16.0 -p npm@11.15.0`, so the runtime preflight and full verify gate have been proven under the repository contract.

## Validation Evidence

Commands run after the alignment pass:

| Check                                                                       | Result                       | Notes                                                                                                  |
| --------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `npm run format:check`                                                      | Pass                         | All matched files use Prettier style.                                                                  |
| `npm run lint:eslint`                                                       | Pass                         | ESLint completed cleanly.                                                                              |
| `npm run typecheck`                                                         | Pass                         | TypeScript no-emit check completed cleanly.                                                            |
| `npm test`                                                                  | Pass                         | 24 files / 85 tests passed; DB integration remains in its explicit integration lane.                   |
| `npm run build`                                                             | Pass                         | Composite TypeScript build completed cleanly.                                                          |
| `npm run verify`                                                            | Pass                         | Full verify passed under pinned Node `24.16.0` and npm `11.15.0`.                                      |
| `npm run test:e2e`                                                          | Pass                         | 1 Playwright widget harness test passed.                                                               |
| `npm run test:db:integration`                                               | Pass                         | Migration and repository contract test passed against local Compose Postgres.                          |
| `npm audit --audit-level=high`                                              | Pass at configured threshold | 4 moderate `drizzle-kit` / `esbuild` advisories remain tracked; the force fix is a breaking downgrade. |
| `docker compose -f infra/local/docker-compose.yml config`                   | Pass                         | Compose resolves with `partner-ai-service` and local Postgres.                                         |
| `docker compose -f infra/local/docker-compose.yml build partner-ai-service` | Pass                         | Docker image built after copying `.npmrc` and pinning npm `11.15.0` inside the image.                  |
| `git diff --check`                                                          | Pass                         | No whitespace/conflict-marker problems.                                                                |

## Issue Closure

### P0.1 Package Names

Resolved. Package directories, package names, imports, TypeScript references, Docker copy paths, lockfile entries, docs, and ADR references use:

- `packages/partner-ai-core`
- `packages/agent-runtime`
- `@side-chat/partner-ai-core`
- `@side-chat/agent-runtime`

Repository search finds no remaining old core/runtime package names.

### P0.2 Governance Scripts

Resolved. Governance scripts enforce the current design:

- `partner-ai-core` cannot import Hono, React, pg, Drizzle, AI SDK, provider SDKs, DB, widget, client, or `agent-runtime`.
- `agent-runtime` owns AI SDK imports and bans HTTP framework, React, pg, Drizzle, DB, widget, and client internals.
- `partner-ai-service` remains the composition root for inbound middleware, adapters, persistence, policy, and runtime wiring.
- Negative governance fixtures still prove failures.

### P0.3 Agent Runtime Boundary

Resolved for the day-one scaffold. `packages/agent-runtime` now exports an Agent/ToolLoopAgent-shaped runtime surface with provider registry, tool registry, runtime profiles, fake provider coverage, and `createAiSdkToolLoopAgent`. Direct `streamText` use remains private to `packages/agent-runtime/src/runtime/ai-sdk-engine.ts`.

### P0.4 Hono Auth Middleware

Resolved. The service now has:

- `inbound/http/middleware/auth-context.ts`
- `inbound/http/middleware/require-auth.ts`
- protected route registration before `/models`, `/chat/*`, and `/usage`
- `partner-ai-core` stream use case input as normalized `AuthContext`
- no raw bearer token, Hono request, cookie, JWT, or Azure DTO in the core use case

### P1.1 Docs And ADR Vocabulary

Resolved. Supporting docs and ADR filenames/content now use the production vocabulary, including `docs/architecture/partner-ai-core-boundaries.md`, `docs/architecture/agent-runtime.md`, and `docs/adr/0006-partner-ai-core-boundary.md`.

### P1.2 HTTP Adapter Split

Resolved. `app.ts` is now app construction plus route registration. Route, middleware, and response responsibilities live under:

- `middleware/auth-context.ts`
- `middleware/require-auth.ts`
- `middleware/request-id.ts`
- `routes/chat-stream.ts`
- `routes/chat-history.ts`
- `routes/chat-usage.ts`
- `routes/models.ts`
- `routes/health.ts`
- `response/sse.ts`
- `response/protocol-errors.ts`

### P1.3 Postgres/Drizzle Integration Lane

Resolved and validated. The repo now includes:

- local Compose Postgres service
- `packages/db/src/repositories/postgres-drizzle.integration.test.ts`
- `npm run test:db:integration`
- GitHub Actions Postgres service and integration-test step

The integration test passed locally against the Compose Postgres service with `SIDECHAT_TEST_DATABASE_URL=postgres://sidechat:sidechat@127.0.0.1:54329/sidechat`.

### P1.4 Docker Image Build

Resolved. The Dockerfile uses the production package names, copies `.npmrc`, installs pinned npm `11.15.0`, and the local Compose image build passes.

### P1.5 Runtime Pin Enforcement

Resolved. `scripts/check-runtime-pins.mjs` is wired into `npm run lint:custom`, which makes `npm run verify` fail before later gates if local Node/npm drift from `.nvmrc`, `engines`, and `packageManager`.

### P1.6 Acceptance Report

Resolved. The acceptance report has been updated as part of the vocabulary/runtime/auth alignment.

### P2.1 Moderate Audit Findings

Tracked. The high-severity audit gate remains green. The moderate `drizzle-kit` transitive advisory remains because npm's suggested `--force` remediation would downgrade to an older breaking tool line.

### P2.2 Stray Generated Map

Resolved. `test-harness/widget-harness/e2e/widget-harness.spec.js.map` was removed.

### P2.3 Shared Testing Boundary

Accepted as evolutionary. `packages/testing` already contains shared builders, stream helpers, and assertions; further utilities should be added when a real package boundary needs them, not prebuilt speculatively.
