# side-chat-service

Read this when: working on the AI SDK 7 service wing.

Source of truth for: the new service's local build, its WorkflowAgent execution substrate, and the greenfield boundary.

Not source of truth for: product turn policy or the legacy service.

This workspace is the production-shaped AI SDK 7 wing on the Workflow DevKit substrate. Nitro routes the engine endpoints itself and sends remaining requests to the Hono app exported by `src/index.ts`.

## Dependency direction

The service follows a hexagonal dependency rule:

```text
bootstrap -> adapters -> application -> ports
```

- `src/ports`: stable configuration declarations. It imports no framework or outer layer.
- `src/application`: resolved settings and product validation rules. It may import ports, never adapters or bootstrap.
- `src/adapters/configuration`: process input and bundled-config selection.
- `src/adapters/inbound/http`: Hono routes and transport behavior.
- `src/adapters/outbound/workflow`: WorkflowAgent execution, serialization, and the isolated abort-signal repair.
- `src/bootstrap`: production/testing wiring and process-owned resource lifecycle.

Tests sit beside the file or bootstrap contract they protect. `scripts/check-side-chat-service-architecture.mjs` enforces the dependency direction.

One turn is one durable `"use workflow"` run in `src/adapters/outbound/workflow/turn-workflow.ts`. The abort repair is isolated beside it in `workflow-abort-signal-patch.ts`. Dev and compatibility runs use the embedded local world; production builds select `@workflow/world-postgres` through `WORKFLOW_TARGET_WORLD` and receive `WORKFLOW_POSTGRES_URL` at runtime.

## Commands

- `npm run build --workspace @side-chat/side-chat-service` (Nitro build to `.output/`)
- `npm run test:service:compatibility`
- `npm run dev --workspace @side-chat/side-chat-service`

The compatibility test builds and boots the compiled Nitro output with a credential-free scripted provider, and additionally guards the patch removal criterion: when its "unpatched probe" test starts failing because the probe streams successfully, an upstream fix has shipped and the patch module must be deleted.

Configuration is declared in the three app-root `sidechat*.config.ts` variants and selected through `SIDECHAT_CONFIG` (`default`, `fake`, or `azure`). The configuration adapter resolves environment references once; the application layer validates the resolved candidate and accumulates safe issues. Bootstrap then chooses the isolated production or testing composition. `/healthz` reports liveness; `/readyz` reports whether startup completed. Provider, authentication, and telemetry adapters arrive in Step 04 without changing this dependency direction.
