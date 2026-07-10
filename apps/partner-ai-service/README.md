# partner-ai-service

Read this when: editing the HTTP service, adapters, or composition root.
Source of truth for: this app's ownership, public surface, and local boundaries.
Not source of truth for: global vocabulary or product requirements.

This is the deployable Hono composition root: the one process that wires
`@side-chat/partner-ai-core`, `@side-chat/agent-runtime`, `@side-chat/db`, and the
enterprise adapters into a running service. It is the repo's deployable backend
app; `apps/docs` is a contributor documentation site. The service is not a host
app — it serves the widget's `sidechat.v1` API, it does not embed the widget. It
owns the server-owned turn runner that forks a fiber per
`assistantTurnId` and the dispatchers, reaper, and pruner around it.

## Owns

- Hono HTTP routes, middleware, and SSE response conversion.
- Auth, config, persistence, policy, provider, and tool adapters.
- The server-owned turn runner, event/cancel/activity dispatchers, reaper, and pruner.
- Deployable service composition of core, runtime, DB, and enterprise adapters.
- Local development/test fixtures that are explicitly enabled by config.

## Does Not Own

- Product workflow policy or lifecycle decisions.
- Provider/AI SDK execution details.
- Browser protocol definitions.
- Widget state or rendering.
- A production host app.

## First Files To Open

- `src/inbound/http/app.ts` — assembles routes and middleware into the Hono app.
- `src/inbound/turn-runner/turn-runner.ts` — the server-owned turn runner (`FiberMap`
  by `assistantTurnId`).
- `src/composition/service-composition.ts` — the composition root; see
  [`src/composition/README.md`](src/composition/README.md).
- `sidechat.config.ts` — the typed `SideChatConfig` that declares what the service runs.

## Configuration

The service declares its entire behavior — provider, models, tools, policy, context
budgets, resumability timers, and env references — in `sidechat.config.ts`. The
canonical reference for that object, its keys, `readEnv`, the loader, and the Azure
variant is [`docs/operations/configuration.md`](../../docs/operations/configuration.md).
For how config becomes the ports, runtime, manifest, and diagnostics the routes
receive, see [`src/composition/README.md`](src/composition/README.md).

## Verify

- `npm test --workspace @side-chat/partner-ai-service`
- `npm run lint:custom`
- Full gate: `npm run verify`

## Canonical Docs

- `docs/architecture/system-map.md`
- `docs/architecture/assistant-turn.md`
- `docs/architecture/extension-seams.md`
- `docs/architecture/package-boundaries.md`
- `docs/operations/verification.md`
