# Side Chat Partner AI Service Runbook

## Scope

This runbook covers the day-one `partner-ai-service` scaffold. It is aligned to the production design requirements for normalized auth context, fail-closed production policy, no durable host-command result behavior before ADR acceptance, provider selection through runtime adapters, and metadata-only observability.

Operationally, the service composes app-owned adapters into the Effect-first
core workflow. HTTP routes call `streamChatEffect(input)`, `partner-ai-core`
calls `AgentRuntimePort.streamEffect(request)`, and only the HTTP/SSE response
writer converts the Effect stream into the transport shape required by Hono.
Concrete tools such as `mock_web_search` are service-owned runtime tools; they
are injected into `agent-runtime` during composition and must not be added as
product knowledge inside the runtime package.

Design anchors:

- `docs/architecture/production-system-design.md:2540` normalized `AuthContext` before protected use cases.
- `docs/architecture/production-system-design.md:2572` streaming/idempotency boundaries.
- `docs/architecture/production-system-design.md:2600` provider selection and fallback behavior.
- `docs/architecture/production-system-design.md:2651` host-command result durable path remains ADR-gated.
- `docs/architecture/production-system-design.md:2657` privacy, audit, and observability requirements.

## Local Provider Paths

The current local-service path is configured from `.env`. For the OpenAI smoke
path, configure the following keys without committing their values:

- `SIDECHAT_PROVIDER=openai`
- `SIDECHAT_OPENAI_API_KEY`
- `SIDECHAT_ALLOWED_MODELS`, currently including `gpt-5.4-mini`
- `SIDECHAT_OPENAI_REASONING_EFFORT=medium`
- `SIDECHAT_OPENAI_REASONING_SUMMARY=auto`
- `SIDECHAT_AUTH_BEARER_TOKEN=local-compose-token`
- `SIDECHAT_DATABASE_URL` when using the local Postgres/Drizzle persistence path

Start the service and widget harness:

```sh
npm run dev --workspace @side-chat/partner-ai-service
npm run dev --workspace @side-chat/widget-harness -- --host 127.0.0.1
curl -fsS http://127.0.0.1:8787/healthz
```

Open the harness at:

```txt
http://127.0.0.1:5173/?mode=local-service&authToken=local-compose-token&workspaceId=workspace_local
```

Local defaults:

- `SIDECHAT_PROFILE=development`
- `SIDECHAT_AUTH_BEARER_TOKEN=local-compose-token`
- `SIDECHAT_POLICY_MODE=allow_all`
- `SIDECHAT_ENABLE_DEV_TOOLS=true`, which exposes non-production development
  capabilities such as `mock_web_search`
- `SIDECHAT_TENANT_ID=tenant_local`
- `SIDECHAT_WORKSPACE_ID=workspace_local`

The fake provider remains available by setting `SIDECHAT_PROVIDER=fake` or by
using mock-stream harness mode. That path is for deterministic tests and UI work,
not for proving the current real-provider service flow.

The local image serves `POST /chat/stream`, `GET /healthz`, and `GET /readyz`. Health responses expose profile, policy mode, provider id, model id, persistence mode, and host-command durability state, but no tokens or message payloads.

## Production Configuration

Required production settings:

- `SIDECHAT_PROFILE=production`
- `SIDECHAT_AUTH_BEARER_TOKEN=<trusted-service-token>` until the production authority adapter replaces the scaffold token adapter.
- `SIDECHAT_TENANT_ID=<tenant-id>`
- `SIDECHAT_WORKSPACE_ID=<workspace-id>`
- `SIDECHAT_PROVIDER=openai` or another accepted real provider.
- `SIDECHAT_OPENAI_API_KEY=<secret>` when OpenAI is selected.
- `SIDECHAT_ENABLE_DEV_TOOLS` must be unset or `false`.
- `SIDECHAT_POLICY_MODE=fail_closed` until entitlement/model policy is configured.
- `SIDECHAT_ALLOWED_MODELS=<comma-separated-model-ids>` only when `SIDECHAT_POLICY_MODE=configured`.
- `SIDECHAT_DATABASE_URL=<postgres-url>`
- `PORT=<service-port>` defaults to `8787`.

Production refuses the development static token, rejects `allow_all` policy mode,
must not boot on the fake provider, and rejects development tool exposure. Real
provider traffic requires secret injection, model allowlist configuration,
data-use review, and live smoke approval.

## Health Checks

Use these checks in deployment and rollback automation:

```sh
curl -fsS http://127.0.0.1:${PORT:-8787}/healthz
curl -fsS http://127.0.0.1:${PORT:-8787}/readyz
```

Expected readiness contract:

- `status` is `ok`.
- `authProfile` is the intended profile.
- `policyMode` matches the rollout stage.
- `providerId` and `modelId` match the accepted local/provider plan.
- `hostCommandResults` is `disabled`.

## Migration Workflow

Before enabling a persistent repository adapter, apply and verify the DB schema contract:

```sh
npm run verify
```

The day-one schema artifact is `packages/db/migrations/0000_side_chat_day_one.sql`. Least-privilege and repository contract tests run through `npm run verify`. Do not add a service write workflow for `host_command_results` unless a later ADR explicitly accepts it.

## Rollback

Rollback is git/image based:

1. Stop new traffic at the edge or deployment controller.
2. Redeploy the previous image tag.
3. Confirm `/healthz` and `/readyz`.
4. Run a provider-appropriate smoke request against `POST /chat/stream`. For the
   current local OpenAI path, confirm the runtime advertises registered tool
   capabilities to the agent and that any model-chosen tool call appears as an
   ordered `sidechat.activity` tool row.
5. If the bad release reached `main`, revert the commit with a new Lore commit and push `main`.

No day-one migration performs destructive schema changes. Do not log or copy
provider credentials during rollback.

## Verification Commands

Run these before declaring an infra or ops change complete:

```sh
npm run verify
npm audit --audit-level=high
docker compose config
npm run dev --workspace @side-chat/partner-ai-service
curl -fsS http://127.0.0.1:8787/healthz
```

If Docker is unavailable in the execution environment, `docker compose config` is the minimum static validation and the missing runtime smoke must be reported.
