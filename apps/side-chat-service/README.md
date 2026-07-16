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
- `src/application/turn/stream`: the outbound scrub filter — the single edge that narrows the engine's UI message stream to the Side Chat wire profile (safe error codes, terminal discipline). The public wire contract is [`docs/architecture/stream-profile.md`](../../docs/architecture/stream-profile.md); its shared vocabulary lives in [`packages/stream-profile`](../../packages/stream-profile/README.md).
- `src/application/conversations`: conversation reads plus best-effort post-turn enrichment. Conversation titles are submitted only after a completed terminal is durable and are conditionally written once; PostgreSQL writes complete inside the title workflow.
- `src/adapters/persistence`: PostgreSQL production state and explicit in-memory test/local substitutes behind application ports.
- `src/adapters/providers`: AI SDK v7 OpenAI/Azure implementations of `ModelProvider`.
- `src/adapters/telemetry`: redacted AI SDK telemetry mapped into `TelemetrySink`.
- `src/config`: one cohesive config DSL, environment resolution, validation, and settings subsystem.
- `src/composition`: route-bundle production/testing wiring and process-owned resource lifecycle.
- `src/workflows`: physical Workflow bundles, with disjoint production/testing scan roots plus the shared typed registry and realm patch.
- `src/testing`: scripted models and other doubles, reachable only from testing composition.

Turn execution enters through `POST /api/chat`; authorized replay and live-tail attachment use `GET /api/chat/:runId/stream?startIndex=N`; cancellation enters through `POST /api/chat/:runId/cancel`; authenticated browser tool results enter through `POST /api/chat/:runId/tools/:toolCallId/output` after the exact durable dispatch is proven. A result is committed before its Workflow hook is resumed, and the endpoint returns retryable `409` until restart recovery makes that hook visible; duplicate submissions reuse the committed outcome. Requests that advertise client tools are rejected before Workflow start unless durable product persistence is configured. Replay cursors count public UI chunks, so the Workflow adapter scans and translates the bounded raw-journal prefix before opening a fresh subscriber. HTTP validates and encodes, application use cases own admission and terminal-state policy, and the production Workflow bundle alone owns WorkflowAgent and provider execution. Each Workflow run returns one journaled terminal outcome; the application persists the native assistant `UIMessage` and detailed usage through PostgreSQL ports, then starts eligible title enrichment without delaying the response.

Authenticated query routes expose conversations, configured models, validated message history, and the newest bound active turn. History validation degrades only the drifting message to safe text and emits content-free telemetry. Production also validates the pinned Postgres World schema at boot and runs an immediate, scheduled, concurrency-safe journal sweep; legal holds and non-terminal runs are never pruned.

Tests sit beside the contract they protect. `scripts/check-side-chat-service-architecture.mjs` enforces the inward dependency law, Workflow directive/import placement, adapter isolation, and production/test separation with known-bad fixtures.

The compatibility turn is a durable `"use workflow"` function in `src/workflows/testing/compatibility-turn.ts`. Its route-side start/resume functions hide Workflow APIs from Hono, while workflow-side composition initializes the scripted `ModelProvider` in that bundle's module instance. The abort repair is isolated in `src/workflows/abort-signal-patch.ts`. Dev and compatibility runs use the embedded local world. The production `build` script pins `WORKFLOW_TARGET_WORLD=@workflow/world-postgres` while Nitro compiles the artifact; `WORKFLOW_POSTGRES_URL` supplies that world's connection at runtime. A runtime environment value cannot change the world already compiled into `.output/`.

## Commands

- `npm run build --workspace @side-chat/side-chat-service` (production Nitro build to `.output/`, statically bound to Postgres World)
- `npm run start --workspace @side-chat/side-chat-service` (serve the compiled middleware through the repository-owned lifecycle listener)
- `npm run test:service:compatibility`
- `npm run test:service:lifecycle` (disposable Postgres proof of compiled boot, streaming, cancellation, crash-resume, bounded shutdown, and compatibility)
- `npm run dev --workspace @side-chat/side-chat-service`

The compatibility test builds and boots a testing-only Nitro workflow graph with a credential-free scripted provider, then rebuilds production and proves its artifact contains no compatibility or scripted-provider marker. It also guards the patch removal criterion: when its "unpatched probe" test starts failing because the probe streams successfully, an upstream fix has shipped and the patch module must be deleted.

The production build uses Nitro's `node_middleware` preset behind `scripts/run-side-chat-service.mjs`. The owned Node listener keeps signal ordering under application control: readiness and admission close first, accepted turns drain within the configured budget, active streams and HTTP connections close, the Workflow world stops, and product resources close last. Repeated signals share one shutdown coordinator; a hard deadline prevents a blocked provider or cleanup stage from hanging process exit.

Configuration is declared in the three app-root `sidechat*.config.ts` variants and selected through `SIDECHAT_CONFIG` (`default`, `fake`, or `azure`). Each standalone file visibly declares its provider connection, default model, complete request-selectable model catalog with per-model reasoning policy, conversation-title job, and exposed server-tool names. Azure deployment routing belongs to each model entry. Service-wide environment names live in uppercase `SERVICE_ENV_KEYS`; provider catalogs supply constants but do not select deployment behavior. Credentials and auth tokens remain secret references. Boot resolves those references, rejects invalid model relationships plus duplicate or unknown tool selections, and uses the same filtered catalogs for HTTP publication and Workflow execution.

Production composition keeps raw provider SDK models private behind a Workflow-serializable model handle. The handle journals only provider identity, model id, and non-secret routing; its step-realm deserializer resolves the current credential through the configuration environment adapter and reconstructs the SDK model there. Credential values, fetch functions, and provider closures never cross the durable boundary. Production rejects both scripted models and an AI SDK global default provider. OpenAI always disables provider retention and explicitly opts out of the AI SDK's automatic detailed reasoning summary unless the config selects one. Azure keeps deployment and API-version routing inside its adapter. Testing composition reuses the serde scripted model under the same boundary contract; it does not create another fake-provider protocol. Initial and replay streams stamp the same durable assistant message id. Cancellation retries only the transient interval before the Workflow hook becomes resumable. After recording that durable user hook, production wakes the run's Workflow-owned abort stream so a Postgres-queued continuation cannot sit behind the active provider step; the replayed hook still owns the cancelled terminal. Missing or expired runs remain ordinary negative acknowledgements and infrastructure failures remain visible.

`/healthz` reports process liveness. `/readyz` probes the Workflow world/queue/worker path selected by Nitro and becomes unavailable after scope close. Routes under `/api/*` pass through `RequestAuthorizer`; errors share one bounded envelope. Telemetry supports `off`, local `console`, and optional `otlp` modes. Every optional OpenTelemetry import lives in `adapters/telemetry/otlp-telemetry.ts`, loads only for `otlp`, and closes with the service scope. The signal inventory, privacy contract, bounded labels, and trace-only OTLP posture are documented in [`docs/operations/telemetry.md`](../../docs/operations/telemetry.md). `composition/route/testing-harness/service-test-harness.ts` supplies authenticated and unauthenticated requests, controlled readiness, collected telemetry, and deterministic cleanup for later steps. The compiled compatibility suite remains the separate proof of Workflow serialization and cancellation physics.
