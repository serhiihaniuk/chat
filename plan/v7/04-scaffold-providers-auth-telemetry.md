# Step 04: Scaffold — Providers, Auth, Telemetry Boot, Test Harness

Read this when: completing the app foundation so turn work can start.

Source of truth for: provider construction, auth/tenancy, telemetry registration, readiness, and the service test harness.

Not source of truth for: the complete telemetry inventory (Step 18) or turn behavior (Step 05+).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 03. Unblocks: Steps 05, 09.

## Outcome

The app has constructed provider instances, authenticated routes, one telemetry registration, a real readiness signal, and a reusable test harness. Scripted models remain testing-only; production composition can construct only OpenAI or Azure adapters.

## Verified source knowledge

- OpenAI: always send `store: false`. When Side Chat omits a reasoning summary, pass the AI SDK v7 explicit opt-out (`null`); leaving it `undefined` enables the SDK's `detailed` default for reasoning models.
- Azure: preserve deployment routing, endpoint normalization, API version, and injected-fetch testing.
- Auth: preserve bearer normalization, constant-time hashed comparison, and production rejection of the development token. Own the v7 identity types locally rather than importing legacy core types.
- Readiness: Workflow/Nitro owns the selected world and worker. Probe that path; do not construct a duplicate Postgres World in service composition.

## Implementation sequence

1. **Provider construction**: construct the selected OpenAI or Azure provider instance from validated Settings. Testing composition reuses the Step 02 scripted model. Add `assertModelInstance(model)` at every agent construction site and reject a configured `globalThis.AI_SDK_DEFAULT_PROVIDER` at boot.
2. **Auth/tenancy + envelope**: implement a v7-owned `RequestAuthorizer`, static-token adapter, Hono middleware, and one secret-safe error envelope.
3. **Readiness**: preserve `GET /readyz`. An injected Workflow probe reports healthy/unhealthy; liveness at `GET /healthz` remains trivial. Closing the service scope makes readiness false.
4. **Telemetry boot**: call AI SDK `registerTelemetry(...)` exactly once per process through a Side Chat guard. Adapt native events into a redacted application sink. Supply collecting, console, and optional OTLP modes. Keep every optional exporter import isolated behind the `otlp` branch so `off` and `console` boot without exporter packages. Step 18 owns the complete event inventory and privacy sentinels.
5. **Keepalive helper**: add an idle SSE-comment transform under `adapters/http`; Step 05 inserts it into the response pipeline.
6. **Test harness**: extend the existing serde scripted model with authenticated request helpers, controlled readiness, collecting telemetry, and deterministic cleanup. Do not create a second fake-provider protocol.

## Contract tests

- `assertModelInstance` rejects strings; boot rejects a global default provider.
- unauthenticated requests receive `401` with the common envelope and no secret data.
- readiness is false for an unhealthy Workflow probe, true for a healthy probe, and false after scope close.
- the telemetry collector receives a boot event; duplicate registration throws a typed startup error.
- OpenAI mocked fetch observes `store: false` and no reasoning-summary request when configuration omits it.
- Azure mocked fetch observes the configured deployment and API version.
- keepalive comments appear only after an idle interval and source bytes remain unchanged.

## Verification

```powershell
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [x] Production provider instances only; testing doubles isolated; model/global guards active.
- [x] Provider request-shape tests pass for OpenAI and Azure.
- [x] Auth behavior is ported into v7-owned boundaries; envelope and readiness are wired.
- [x] Telemetry registers once; collector and console sinks are redacted; optional OTLP imports and lifecycle are isolated.
- [x] The documented harness is reusable by later steps.

## Handoff record

Registry/auth/telemetry entry points: `src/composition/providers/production-model-provider.ts`; `src/adapters/auth/static-token-authorizer.ts`; `src/adapters/telemetry/ai-sdk-telemetry.ts`

Scripted-provider helper: `src/testing/scripted-language-model.ts`
