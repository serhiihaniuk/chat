# Side Chat Production Plan Acceptance Report

Date: 2026-05-25

## Verdict

The repository is aligned with the current production system design
implementation state covered by the validation register. Acceptance now means
the app structure, package boundaries, build gates, AI SDK runtime path,
generated artifacts, persistence composition, docs/ADRs, widget component
system, and local/pipeline verification gates are present and enforced.

The local service can run through the configured OpenAI provider path from
`.env`, while the fake provider and mock-stream harness remain deterministic test
paths.

## Verification Evidence

- `npm run verify`: pass under pinned Node `24.16.0` / npm `11.15.0`.
- `npm run test:e2e`: pass when browser automation is available; Playwright runs
  the widget harness browser spec.
- `npm run test:db:integration`: pass against local Compose Postgres.
- `npm run audit`: pass at `--audit-level=high` when run as part of ops checks.
- `docker compose -f infra/local/docker-compose.yml config`: pass.
- `docker compose -f infra/local/docker-compose.yml build partner-ai-service`: pass.
- Local API smoke: `/healthz` reports OpenAI provider metadata without secrets,
  and the OpenAI runtime receives registered tool capabilities through the AI
  SDK agent loop.

## Accepted State

- `apps/partner-ai-service` uses `inbound/http`, `composition`, `adapters`, `outbound`, and config boundaries.
- Production persistence fails closed without `SIDECHAT_DATABASE_URL`; production composition selects the Postgres/Drizzle repository adapter.
- `packages/db` includes real Postgres/Drizzle repositories for conversations, messages, assistant turns, context snapshots, usage, tool invocations, host command results, and audit events.
- `packages/agent-runtime` routes provider execution through AI SDK-backed
  runtime code and exposes `streamEffect(request)` as its only assistant-turn
  stream surface.
- `apps/partner-ai-service` registers the app-owned deterministic
  `mock_web_search` runtime tool in development composition. The model decides
  whether to call it through `ToolLoopAgent`; observed tool-call/tool-result
  parts map into normalized activity without external egress.
- `packages/partner-ai-core` is organized into domain, application, ports,
  policies, errors, and services. Its chat workflow entrypoint is
  `streamChatEffect(input)` with app-owned ports supplied through Effect
  services/layers.
- `packages/side-chat-widget` is organized into `widgets`, `features`,
  `entities`, and `shared`, with exact shadcn-style primitives and AI
  Elements-derived components under `shared/ui` and `shared/ai`.
- `entities/chat` owns the canonical assistant activity projection that renders
  the Thinking timeline in protocol order.
- `packages/testing` provides shared protocol builders, stream helpers, and assertions.
- Generated protocol/OpenAPI artifacts are required by governance.
- Boundary, dependency, outbound, TypeScript, package export, generated artifact,
  widget-layer, code-quality, and fixture-backed governance checks run in
  `npm run verify`.
- The repository does not currently ship `.github` workflows. External CI can
  adopt `npm run verify`, e2e, audit, compose config, and image build commands.

## Tracked Exceptions

- Browser automation against the in-app URL may be blocked by app browser policy;
  in that case use API smoke plus repo verification and report the missing
  visual click-through.
- `skipLibCheck: true` is an explicit policy decision documented in `docs/architecture/typescript-policy.md` and enforced by governance.
