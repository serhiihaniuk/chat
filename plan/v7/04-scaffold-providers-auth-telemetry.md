# Step 04: Scaffold — Providers, Auth, Telemetry Boot, Test Harness

Read this when: completing the app foundation so turn work can start.

Source of truth for: the provider registry, ported auth/tenancy, telemetry registration, readiness, and the test harness.

Not source of truth for: settings shapes (Step 03) or turn behavior (Step 05+).

Tracking: status and owner are maintained only in [`STATUS.md`](./STATUS.md).

Depends on: Step 03. Unblocks: Steps 05, 09.

## Outcome

The app has constructed provider instances, authenticated routes, one telemetry registration, a real readiness signal, and a test harness good enough that every later step writes red-green tests on day one.

## Current evidence to verify

- Provider settings knowledge to port (the knowledge, not the adapter layer): `packages/agent-runtime/src/providers/openai/openai-model-provider.ts` (must keep: `store: false`; reasoning summaries **explicitly disabled** when config omits them — v7 defaults to `detailed` when reasoning is on), `providers/azure/azure-openai-model-provider.ts` (deployment routing, endpoint normalization, API version, custom fetch).
- Auth/tenancy middleware + HTTP error envelope: locate under `apps/partner-ai-service/src/inbound/http/**` (verify exact modules) and port by copy.
- SDK mock/scripted provider utilities: verify exact helper names in the installed `ai` package — do not rebuild a fake provider protocol.

## Implementation sequence

1. **Provider registry**: construct OpenAI/Azure/fake provider **instances** from Settings, preserving the ported provider-settings knowledge. Add `assertModelInstance(model)` used at every future agent construction site; a string model throws (Gateway trap). Boot-time assertion that `globalThis.AI_SDK_DEFAULT_PROVIDER` is unset.
2. **Auth/tenancy + envelope**: port middleware by copy; one error envelope module; wire onto the app factory.
3. **Readiness**: `GET /ready` = config validated + DB reachable `[+ world worker started, workflow-branch]`; liveness stays trivial.
4. **Telemetry boot**: `registerTelemetry(...)` exactly once per Settings — in-memory collector (tests), console (local), OTLP behind config with the unstable import isolated in one module. Per-call `telemetry` options remain available to later steps.
5. **Keepalive helper** in `http/`: injects periodic SSE comment frames at `keepalive.intervalMs` (core sends none); used from Step 05.
6. **Test harness**: extend Step 02a's scripted-provider/disposable-infrastructure harness; add authenticated route helpers and one boot test proving readiness flips only after mandatory startup. Do not create a second fake-provider system.

## Contract tests

- `assertModelInstance` rejects a string model; the boot assertion fails if a global default provider is set;
- an unauthenticated request is rejected by the ported middleware with the envelope shape;
- readiness false before DB/worker startup completes, true after `[workflow-branch]`;
- telemetry collector receives a boot event; a second registration throws a typed startup error (duplicate global registration is a composition defect);
- OpenAI request-shape test (mocked fetch): `store: false` present; reasoning summary explicitly disabled when config omits it;
- Azure request-shape test: deployment/API-version routing intact.

## Verification

```powershell
npm test -- apps/side-chat-service
npm run typecheck
npm run lint:custom
```

## Completion checklist

- [ ] Provider instances only, with guard + boot assertions.
- [ ] Provider request-shape tests pass for OpenAI and Azure knowledge items.
- [ ] Auth ported by copy; envelope in place; readiness real.
- [ ] Telemetry registered once; exporter isolation module exists.
- [ ] Harness usable by later steps (documented in the app README stub).

## Handoff record

Registry/auth/telemetry entry points: pending

Mock-provider helpers selected: pending
