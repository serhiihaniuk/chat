# Side Chat Repo Context

Side Chat is an embeddable AI assistant product. The repository owns the product protocol, browser client, React widget, host bridge contract, partner AI core, agent runtime, concrete adapters, database boundary, and local/test harnesses.

It does not own a production host application. Real host apps are external consumers that integrate through the widget, browser client, host bridge, and typed protocol.

Primary product path:

```txt
external host app
-> side-chat-widget
-> chat-client
-> chat-protocol
-> partner-ai-service
-> partner-ai-core
-> agent-runtime
-> adapters
```

The browser/backend contract is `sidechat.v1`. It must not expose provider-native stream parts, AI SDK UI messages, database rows, HTTP framework objects, Effect runtime details, Drizzle/Postgres internals, or host application internals.

## Architecture

The repo is an npm workspace modular monolith. Package boundaries are treated as architecture, not just folder organization.

Core rules:

- `packages/chat-protocol` owns product DTOs, request validation, event types, SSE encoding, generated schema, and protocol fixtures.
- `packages/partner-ai-core` is framework-free and hexagonal. It owns domain rules, policy, use cases, ports, typed errors, and Effect service wiring.
- `packages/agent-runtime` owns AI SDK-backed runtime execution, provider registry, provider adapters, fake provider, runtime tools, and normalized runtime events.
- `apps/partner-ai-service` owns Hono routes, HTTP concerns, config parsing, auth/policy/persistence adapters, and service composition.
- `packages/db` owns Postgres/Drizzle schema, migrations, repository contracts, memory repositories, and real Postgres repository adapters.
- `packages/chat-client` owns browser transport and SSE decoding, not React state.
- `packages/host-bridge` owns the external host integration contract.
- `packages/side-chat-widget` owns React UI/state and uses a trimmed Feature-Sliced Design shape: `widgets`, `features`, `entities`, and `shared`.
- `test-harness/widget-harness` is the local Vite/Playwright harness for browser verification.

Dependency direction matters. Runtime provider code, Hono, Drizzle, Postgres, Effect runtime concepts, and service internals must not leak into browser/widget contracts.

## Repository structure

- `apps/partner-ai-service`: deployable backend service.
- `packages/chat-protocol`: `sidechat.v1` contract and stream codec.
- `packages/chat-client`: browser-safe typed stream client.
- `packages/host-bridge`: host command/context boundary.
- `packages/partner-ai-core`: framework-free backend core.
- `packages/agent-runtime`: AI SDK runtime, fake provider, OpenAI adapter, tools.
- `packages/db`: schema contract, Drizzle schema, migrations, repositories.
- `packages/side-chat-widget`: React widget and UI system.
- `packages/testing`: shared test builders and protocol helpers.
- `test-harness/widget-harness`: Vite harness and Playwright specs.
- `test-harness/adoption-harness`: harness exercising host-app adoption/integration of the widget.
- `docs/architecture`: source-of-truth design notes.
- `docs/adr`: accepted architecture decisions.
- `docs/operations`: test-harness and verification notes (e.g. `verification.md`).
- `scripts`: custom governance checks used by `npm run verify`.

## Testing stack

Default tools:

- Vitest for unit, contract, service, and integration tests.
- Testing Library + user-event for widget/component tests.
- Playwright for critical browser harness E2E.
- `renderToStaticMarkup` for some simple widget render/a11y tests.
- Memory repositories and fake providers as preferred deterministic doubles.
- Postgres/Drizzle tests only as opt-in integration tests.

Do not assume jest-dom matchers or new assertion libraries.

Ordinary tests are colocated as `*.test.ts` or `*.test.tsx` beside the source. Harness-level tests live under `test-harness`.

## Commands

```sh
npm test
npm run test:e2e
npm run test:db:local
npm run typecheck
npm run lint
npm run build
npm run verify
```

Use `npm run verify` as the broad confidence check before claiming a change is fully safe.
