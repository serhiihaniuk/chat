# Side Chat Production Plan Acceptance Report

Date: 2026-05-23

## Verdict

The repository is aligned with the production system design implementation state covered by the current validation register. This report replaces the earlier scaffold-only acceptance posture: acceptance now means the app structure, package boundaries, build gates, browser e2e, AI SDK runtime path, generated artifacts, persistence composition, docs/ADRs, and CI gates are present and enforced.

The Docker image build and live Postgres integration lane have now been validated locally as well as being wired in CI.

## Verification Evidence

- `npm run verify`: pass under pinned Node `24.16.0` / npm `11.15.0`.
- `npm run test:e2e`: pass; Playwright runs the widget harness browser spec.
- `npm run test:db:integration`: pass against local Compose Postgres.
- `npm run audit`: pass at `--audit-level=high`; 4 moderate `drizzle-kit`/`esbuild` advisories remain tracked.
- `docker compose -f infra/local/docker-compose.yml config`: pass.
- `docker compose -f infra/local/docker-compose.yml build partner-ai-service`: pass.

## Accepted State

- `apps/partner-ai-service` uses `inbound/http`, `composition`, `adapters`, `outbound`, and config boundaries.
- Production persistence fails closed without `SIDECHAT_DATABASE_URL`; production composition selects the Postgres/Drizzle repository adapter.
- `packages/db` includes real Postgres/Drizzle repositories for conversations, messages, assistant turns, context snapshots, usage, tool invocations, host command results, and audit events.
- `packages/agent-runtime` routes OpenAI execution through AI SDK-backed runtime code.
- `packages/partner-ai-core` is organized into domain, application, ports, policies, errors, and services, including Effect service/layer coverage.
- `packages/side-chat-widget` is organized into application, domain, UI primitives, and assets.
- `packages/testing` provides shared protocol builders, stream helpers, and assertions.
- Generated protocol/OpenAPI artifacts are required by governance.
- Boundary, dependency, outbound, TypeScript, package export, generated artifact, and fixture-backed governance checks run in `npm run verify`.
- CI runs install, verify, e2e, audit, compose config, and Docker image build.

## Tracked Exceptions

- Moderate `drizzle-kit`/`esbuild` advisory is not auto-fixed because the suggested force fix is breaking. Track upstream `drizzle-kit` resolution.
- `skipLibCheck: true` is an explicit policy decision documented in `docs/architecture/typescript-policy.md` and enforced by governance.
