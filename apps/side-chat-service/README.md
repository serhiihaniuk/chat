# side-chat-service

Read this when: working on the AI SDK 7 service wing.

Source of truth for: the new service's local build, its WorkflowAgent execution substrate, and the greenfield boundary.

Not source of truth for: product turn policy or the legacy service.

This workspace is the production-shaped AI SDK 7 wing on the Workflow DevKit substrate. Nitro routes the engine endpoints itself and sends remaining requests to the Hono app exported by `src/index.ts`.

## Architecture

The normative target is [`plan/v7/ARCHITECTURE.md`](../../plan/v7/ARCHITECTURE.md). Folders follow ownership and physical bundle seams, not a fixed layer chain:

- `src/application/ports`: application-owned behavioral interfaces with real substitutions.
- `src/adapters/http`: Hono translation; it calls only sanctioned Workflow entry functions.
- `src/config`: one cohesive config DSL, environment resolution, validation, and settings subsystem.
- `src/composition`: route-bundle production/testing wiring and process-owned resource lifecycle.
- `src/workflows`: physical Workflow bundles, with disjoint production/testing scan roots plus the shared typed registry and realm patch.
- `src/testing`: scripted models and other doubles, reachable only from testing composition.

Tests sit beside the contract they protect. `scripts/check-side-chat-service-architecture.mjs` enforces the inward dependency law, Workflow directive/import placement, adapter isolation, and production/test separation with known-bad fixtures.

The compatibility turn is a durable `"use workflow"` function in `src/workflows/testing/compatibility-turn.ts`. Its route-side start/resume functions hide Workflow APIs from Hono, while workflow-side composition initializes the scripted `ModelProvider` in that bundle's module instance. The abort repair is isolated in `src/workflows/abort-signal-patch.ts`. Dev and compatibility runs use the embedded local world; production builds select `@workflow/world-postgres` through `WORKFLOW_TARGET_WORLD` and receive `WORKFLOW_POSTGRES_URL` at runtime.

## Commands

- `npm run build --workspace @side-chat/side-chat-service` (Nitro build to `.output/`)
- `npm run test:service:compatibility`
- `npm run dev --workspace @side-chat/side-chat-service`

The compatibility test builds and boots a testing-only Nitro workflow graph with a credential-free scripted provider, then rebuilds production and proves its artifact contains no compatibility or scripted-provider marker. It also guards the patch removal criterion: when its "unpatched probe" test starts failing because the probe streams successfully, an upstream fix has shipped and the patch module must be deleted.

Configuration is declared in the three app-root `sidechat*.config.ts` variants and selected through `SIDECHAT_CONFIG` (`default`, `fake`, or `azure`). The cohesive config subsystem resolves environment references and accumulates safe validation issues. Composition then chooses the isolated production or testing route bundle. `/healthz` reports liveness; `/readyz` reports whether startup completed. Provider, authentication, and telemetry adapters arrive in Step 04 through application-owned ports.
