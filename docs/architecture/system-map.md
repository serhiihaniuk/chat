# System Map

Read this when: you need the whole Side Chat system on one page.
Source of truth for: product identity, package roles, and first files to open.
Not source of truth for: detailed lifecycle order, extension contracts, or term
definitions.

Side Chat is an adoptable enterprise assistant foundation. A host app embeds the
widget, calls the service, and keeps owning its business UI, auth, data,
permissions, and host-specific behavior. This repo owns the assistant UI,
browser protocol, deployable service composition, product core, runtime
boundary, persistence contracts, and extension seams.

`apps/partner-ai-service` is deployable service composition, not a demo app. Mock
or local capabilities are fixtures and must fail closed outside explicit local
profiles.

## Flow

```txt
host app
-> side-chat-widget
-> chat-client
-> chat-protocol
-> partner-ai-service
-> partner-ai-core
-> agent-runtime
-> provider and runtime tools

agent-runtime RuntimeEvent
-> partner-ai-core SidechatStreamEvent
-> chat-client
-> side-chat-widget message/activity state
```

## Package Map

| Package                         | Owns                                                                                          | Must not own                                                          | First files to open                                                                           |
| ------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/partner-ai-service`       | HTTP routes, config/auth, app adapters, service composition, SSE transport.                   | Product lifecycle decisions, provider internals, widget state.        | `src/inbound/http/app.ts`, `src/composition/service-composition.ts`, `src/adapters/README.md` |
| `packages/partner-ai-core`      | Stream-chat workflow, policy, context, ports, lifecycle, protocol mapping.                    | Hono, DB rows, provider SDKs, React.                                  | `src/application/stream-chat/README.md`, `src/application/stream-chat/stream-chat.ts`         |
| `packages/agent-runtime`        | Prepared assistant turn execution, executors, runtime tools, provider adapter, RuntimeEvents. | Product policy, persistence, browser protocol, host-command dispatch. | `src/runtime/README.md`, `src/runtime/agent-runtime.ts`                                       |
| `packages/chat-protocol`        | `sidechat.v1` request/event DTOs, validators, SSE codec, generated schema.                    | Runtime events, provider parts, Hono, Effect, React.                  | `src/sidechat-v1/index.ts`                                                                    |
| `packages/chat-client`          | Browser-safe stream/resource client and SSE reader.                                           | Protocol definitions, widget state, runtime internals.                | `src/transport/client.ts`, `src/transport/sse-reader.ts`                                      |
| `packages/side-chat-widget`     | React widget, FSD layers, protocol-to-UI state, host bridge usage.                            | Effect, provider SDKs, DB rows, service internals.                    | `src/widgets/side-chat/`, `src/features/chat/model/`                                          |
| `packages/host-bridge`          | Browser host context and host-command dispatch seam.                                          | RuntimeTool execution, backend persistence, service routes.           | `src/bridge/bridge.ts`, `src/commands/`                                                       |
| `packages/db`                   | Persistence schema, repository contracts, adapters, memory repositories.                      | Product use cases, Hono routes, runtime execution, widget state.      | `src/schema-contract/`, `src/repositories/`                                                   |
| `packages/shared`               | Domain-neutral TypeScript helpers.                                                            | Product, protocol, runtime, widget, or persistence ownership.         | `src/index.ts`                                                                                |
| `packages/testing`              | Shared test-only helpers.                                                                     | Production behavior or package-specific business fixtures.            | `src/index.ts`                                                                                |
| `test-harness/adoption-harness` | Cross-package adopter golden-path tests.                                                      | Production deployment or browser-only harness behavior.               | `src/adoption-golden-path.test.ts`                                                            |
| `test-harness/widget-harness`   | Vite/Playwright widget harness modes.                                                         | Production host app behavior or service policy.                       | `src/app/harness-app.tsx`, `e2e/`                                                             |

## Invariants

- Product policy and prepared context stay in `partner-ai-core`.
- Provider and AI SDK details stay in `agent-runtime`.
- Browser contracts stay in `chat-protocol`, `chat-client`, `host-bridge`, and
  the widget.
- Concrete enterprise adapters live in service composition and are injected
  through core/runtime ports.
- The repo does not ship a production host app.
