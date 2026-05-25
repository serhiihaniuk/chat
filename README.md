# Side Chat

Side Chat is an embeddable assistant product. This repository owns the product protocol, browser client, React widget, host bridge contract, partner AI core, agent runtime, concrete adapters, database boundary, and test harnesses.

It does **not** own a consuming host application or demo dashboard. External host apps integrate through the stable boundary:

```txt
external host app -> side-chat-widget -> chat-client -> chat-protocol -> partner-ai-service -> partner-ai-core -> agent-runtime -> adapters
```

The browser/backend contract is product-owned and must not expose provider-native stream parts, AI SDK internals, database rows, or host-app implementation details. See `docs/architecture/production-system-design.md` for the source of truth.

Server/core packages are Effect-first. `partner-ai-core` exposes
`streamChatEffect(input)` through Effect services/layers, and `agent-runtime`
exposes `streamEffect(request)` as its only assistant-turn stream surface.
Concrete tools and external-service adapters live in apps, then get injected
through ports. Browser/client/widget APIs stay plain protocol and React-friendly
TypeScript.

Local service smoke runs through the configured service path. The current local
workspace runs `partner-ai-service` from `.env`, with OpenAI selected through
`SIDECHAT_PROVIDER=openai`, an allowed model list, and medium reasoning by
default. Do not put secret values in docs or committed examples.

```sh
npm run dev --workspace @side-chat/partner-ai-service
npm run dev --workspace @side-chat/widget-harness -- --host 127.0.0.1
```

Open the harness with a local-service URL such as
`http://127.0.0.1:5173/?mode=local-service&authToken=local-compose-token&workspaceId=workspace_local`.

The fake provider and mock-stream harness mode still exist for deterministic
tests and UI development. They are explicit development paths, not the current
local OpenAI smoke path.

Operational rollout, rollback, and verification steps live in `docs/ops/side-chat-production-runbook.md`.

## Test Lanes

The testing source of truth is `docs/architecture/testing-system-design.md`.

- `npm test`: fast deterministic Vitest lane.
- `npm run test:e2e`: memory-backed Playwright harness.
- `npm run test:db:container`: Testcontainers Postgres repository contract.
- `npm run test:e2e:persistent`: real widget/service with Testcontainers
  Postgres and fake provider.
- `npm run verify`: host full gate with pinned Node/npm.
- `npm run verify:container`: CI/release parity gate inside the dev/test app
  container.
