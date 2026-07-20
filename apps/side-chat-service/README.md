# side-chat-service

Read this when: working inside the Side Chat service application.
Source of truth for: this app's local structure, runtime composition, and workspace commands.
Not source of truth for: cross-package ownership ([package boundaries](../../docs/architecture/package-boundaries.md)) or turn semantics ([assistant turn](../../docs/architecture/assistant-turn.md)).

`@side-chat/side-chat-service` is the only backend application. It combines Hono/Nitro HTTP delivery, application policy and ports, Workflow DevKit durable execution, AI SDK 7 model/tool streaming, provider adapters, PostgreSQL composition, admission, telemetry, and process lifecycle.

Adopter contracts come from the side-effect-free `@side-chat/side-chat-server`
framework package. This application is the deployable reference composition.

## Structure

- `src/sidechat.ts` — adopter manifest and registered integration catalog.
- `src/auth` — configured request-authorizer adapters.
- `src/integrations` — adopter-owned external adapters and server tools.

- `src/domain` — app-owned value types and invariants.
- `src/application/ports` — behavioral interfaces owned by service use cases.
- `src/application/turn` — turn preparation, admission, tools, stream scrubbing, execution, and terminal projection.
- `src/application/conversations` — conversation reads and post-turn title enrichment.
- `src/adapters/http` — Hono routes, validation, auth middleware, safe errors, SSE, and replay translation.
- `src/adapters/persistence` — app-side bindings to `@side-chat/db` plus explicit test substitutes.
- `src/adapters/providers` — OpenAI/Azure AI SDK adapters behind the app-owned model port.
- `src/adapters/telemetry` — bounded console/OTLP implementations.
- `src/config` — declarative provider/model/tool configuration, environment references, validation, and resolved settings.
- `src/composition` — production/testing route and Workflow wiring plus owned resource lifecycle.
- `src/workflows` — durable chat, claim, timeout, abort, server-tool, client-tool, approval, and testing workflows.
- `src/testing` — deterministic doubles reachable only from testing composition.

The architecture gate in `scripts/check-side-chat-service-architecture.mjs` enforces app-layer direction, Workflow import placement, provider isolation, and production/testing separation.

## Runtime surface

`POST /api/chat` validates, admits, starts or reuses, and streams one durable turn. Replay uses `GET /api/chat/:runId/stream?startIndex=N`; cancellation uses `POST /api/chat/:runId/cancel`; client-tool results and approval decisions have their own authenticated run-scoped endpoints.

The public wire is the AI SDK UI-message stream `v1`, narrowed by the shared [stream profile](../../docs/architecture/stream-profile.md). Replay cursors count public UI chunks, not raw Workflow journal records. Workflow owns the durable run/journal; product history and terminal state are projected through `@side-chat/db`.

The service exposes authenticated conversation, model, capability, configuration, and activity routes plus `/healthz` and `/readyz`. Activity SSE is separate from the chat stream and contains identity/lifecycle data only.

## Configuration

The app-root `sidechat*.config.ts` declarations select provider connections, model catalogs and reasoning policy, title behavior, server tools, host-context limits, admission, timeouts, auth references, and telemetry. `SIDECHAT_CONFIG` chooses the configured declaration. Secret values resolve only through the environment adapter and never enter Workflow input or browser catalogs.

Production Workflow composition carries only serializable, non-secret provider/model identity across the durable boundary and reconstructs SDK delegates in the current Workflow realm. The production build pins the PostgreSQL Workflow world; `WORKFLOW_POSTGRES_URL` supplies its runtime connection.

## Lifecycle

The repository-owned Node listener makes shutdown ordering explicit: readiness and admission close, accepted turns drain within budget, streams and HTTP connections close, the Workflow world stops, and product resources close. Production validates the pinned Workflow schema at boot and runs bounded journal maintenance for eligible terminal runs.

## Commands

- `npm run dev --workspace @side-chat/side-chat-service`
- `npm run build --workspace @side-chat/side-chat-service`
- `npm run start --workspace @side-chat/side-chat-service`
- `npm run test:service:compatibility` — compiled testing-bundle and production-isolation proof.
- `npm run test:service:lifecycle` — disposable PostgreSQL proof of boot, stream, cancel, crash recovery, and bounded shutdown.

Use the repository-wide command matrix in [verification.md](../../docs/operations/verification.md) for broader gates.
