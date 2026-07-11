# side-chat-service

Read this when: working on the AI SDK 7 service wing.

Source of truth for: the new service's local build, its WorkflowAgent execution substrate, and the greenfield boundary.

Not source of truth for: product turn policy or the legacy service.

This workspace is the production-shaped AI SDK 7 wing on the Workflow DevKit substrate. Nitro routes the engine endpoints itself and sends remaining requests to the Hono app exported by `src/index.ts`.

## Architecture

The normative target is [`plan/v7/ARCHITECTURE.md`](../../plan/v7/ARCHITECTURE.md). Folders follow ownership and physical bundle seams, not a fixed layer chain:

- `src/application/ports`: application-owned behavioral interfaces with real substitutions.
- `src/adapters/auth`: credential-authority implementations behind `RequestAuthorizer`.
- `src/adapters/http`: Hono translation, auth middleware, health routes, and stream transforms.
- `src/adapters/persistence`: temporary in-memory turn state behind application ports; Step 09 replaces it with PostgreSQL.
- `src/adapters/providers`: AI SDK v7 OpenAI/Azure implementations of `ModelProvider`.
- `src/adapters/telemetry`: redacted AI SDK telemetry mapped into `TelemetrySink`.
- `src/config`: one cohesive config DSL, environment resolution, validation, and settings subsystem.
- `src/composition`: route-bundle production/testing wiring and process-owned resource lifecycle.
- `src/workflows`: physical Workflow bundles, with disjoint production/testing scan roots plus the shared typed registry and realm patch.
- `src/testing`: scripted models and other doubles, reachable only from testing composition.

Turn execution enters through `POST /api/chat`; cancellation enters through `POST /api/chat/:runId/cancel`. HTTP validates and encodes, application use cases own admission and terminal-state policy, and the production Workflow bundle alone owns WorkflowAgent and provider execution. Each Workflow run returns one journaled terminal outcome; the application projects it through persistence ports, then releases admission and closes the response. Step 05's projection is intentionally in memory until Step 09 supplies PostgreSQL.

Tests sit beside the contract they protect. `scripts/check-side-chat-service-architecture.mjs` enforces the inward dependency law, Workflow directive/import placement, adapter isolation, and production/test separation with known-bad fixtures.

The compatibility turn is a durable `"use workflow"` function in `src/workflows/testing/compatibility-turn.ts`. Its route-side start/resume functions hide Workflow APIs from Hono, while workflow-side composition initializes the scripted `ModelProvider` in that bundle's module instance. The abort repair is isolated in `src/workflows/abort-signal-patch.ts`. Dev and compatibility runs use the embedded local world; production builds select `@workflow/world-postgres` through `WORKFLOW_TARGET_WORLD` and receive `WORKFLOW_POSTGRES_URL` at runtime.

## Commands

- `npm run build --workspace @side-chat/side-chat-service` (Nitro build to `.output/`)
- `npm run test:service:compatibility`
- `npm run dev --workspace @side-chat/side-chat-service`

The compatibility test builds and boots a testing-only Nitro workflow graph with a credential-free scripted provider, then rebuilds production and proves its artifact contains no compatibility or scripted-provider marker. It also guards the patch removal criterion: when its "unpatched probe" test starts failing because the probe streams successfully, an upstream fix has shipped and the patch module must be deleted.

Configuration is declared in the three app-root `sidechat*.config.ts` variants and selected through `SIDECHAT_CONFIG` (`default`, `fake`, or `azure`). Service-wide environment names live in uppercase `SERVICE_ENV_KEYS`; each provider catalog owns its model ids, supported reasoning values, and provider-specific environment names. Credentials and auth tokens remain secret references. The cohesive config subsystem resolves those references and accumulates safe validation issues.

Production composition constructs a provider model instance and rejects both scripted models and an AI SDK global default provider. OpenAI always disables provider retention and explicitly opts out of the AI SDK's automatic detailed reasoning summary unless the config selects one. Azure keeps deployment and API-version routing inside its adapter. Testing composition reuses the serde scripted model; it does not create another fake-provider protocol.

`/healthz` reports process liveness. `/readyz` probes the Workflow world/queue/worker path selected by Nitro and becomes unavailable after scope close. Routes under `/api/*` pass through `RequestAuthorizer`; errors share one bounded envelope. Telemetry supports `off`, local `console`, and optional `otlp` modes. Every optional OpenTelemetry import lives in `adapters/telemetry/otlp-telemetry.ts`, loads only for `otlp`, and closes with the service scope. `composition/route/testing-harness/service-test-harness.ts` supplies authenticated and unauthenticated requests, controlled readiness, collected telemetry, and deterministic cleanup for later steps. The compiled compatibility suite remains the separate proof of Workflow serialization and cancellation physics.
