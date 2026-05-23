# Side Chat Partner AI Service Runbook

## Scope

This runbook covers the day-one `partner-ai-service` scaffold. It is aligned to the production design requirements for normalized auth context, fail-closed production policy, no durable host-command result behavior before ADR acceptance, provider selection through runtime adapters, and metadata-only observability.

Design anchors:

- `docs/architecture/production-system-design.md:2540` normalized `AuthContext` before protected use cases.
- `docs/architecture/production-system-design.md:2572` streaming/idempotency boundaries.
- `docs/architecture/production-system-design.md:2600` provider selection and fallback behavior.
- `docs/architecture/production-system-design.md:2651` host-command result durable path remains ADR-gated.
- `docs/architecture/production-system-design.md:2657` privacy, audit, and observability requirements.

## Local Fake-Provider Path

The compose profile runs with the fake provider and does not require real credentials:

```sh
docker compose up --build partner-ai-service
curl -fsS http://127.0.0.1:8787/healthz
```

Local configuration:

- `SIDECHAT_PROFILE=development`
- `SIDECHAT_AUTH_BEARER_TOKEN=local-compose-token`
- `SIDECHAT_POLICY_MODE=allow_all`
- `SIDECHAT_TENANT_ID=tenant_local`
- `SIDECHAT_WORKSPACE_ID=workspace_local`

The local image serves `POST /chat/stream`, `GET /healthz`, and `GET /readyz`. Health responses expose profile, policy mode, provider id, model id, persistence mode, and host-command durability state, but no tokens or message payloads.

## Production Configuration

Required production settings:

- `SIDECHAT_PROFILE=production`
- `SIDECHAT_AUTH_BEARER_TOKEN=<trusted-service-token>` until the production authority adapter replaces the scaffold token adapter.
- `SIDECHAT_TENANT_ID=<tenant-id>`
- `SIDECHAT_WORKSPACE_ID=<workspace-id>`
- `SIDECHAT_POLICY_MODE=fail_closed` until entitlement/model policy is configured.
- `SIDECHAT_ALLOWED_MODELS=<comma-separated-model-ids>` only when `SIDECHAT_POLICY_MODE=configured`.
- `PORT=<service-port>` defaults to `8787`.

Production refuses the development static token and rejects `allow_all` policy mode. The day-one service still defaults to the fake provider until a provider-selection service configuration is accepted; real OpenAI provider traffic remains gated by ADR 0002 follow-up rollout work, secret injection, data-use review, and live integration tests.

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
4. Run a fake-provider smoke request against `POST /chat/stream`.
5. If the bad release reached `main`, revert the commit with a new Lore commit and push `main`.

No default local path uses real model credentials, and no day-one migration performs destructive schema changes.

## Verification Commands

Run these before declaring an infra or ops change complete:

```sh
npm run verify
npm audit --audit-level=high
docker compose config
docker compose up --build partner-ai-service
curl -fsS http://127.0.0.1:8787/healthz
```

If Docker is unavailable in the execution environment, `docker compose config` is the minimum static validation and the missing runtime smoke must be reported.
